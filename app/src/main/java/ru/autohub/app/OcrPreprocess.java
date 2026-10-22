package ru.autohub.app;

/**
 * Подготовка снимка документа к OCR (чистая Java без Android API — проверяется на ПК тем же кодом).
 * Шаги: оттенки серого → масштаб Lanczos-3 (мелкие фото увеличиваются) → порог Оцу →
 * стирание длинных горизонтальных и вертикальных линий таблицы. Результат — чёрный текст на белом.
 */
public final class OcrPreprocess {
    private OcrPreprocess() {}

    /** Итоговый размер: длинная сторона = longSide, но не больше maxPixels. Возвращает {w, h}. */
    public static int[] targetSize(int w, int h, int longSide, long maxPixels) {
        double k = (double) longSide / Math.max(w, h);
        k = Math.min(k, Math.sqrt((double) maxPixels / ((double) w * h)));
        return new int[]{Math.max(1, (int) Math.round(w * k)), Math.max(1, (int) Math.round(h * k))};
    }

    /** argb — пиксели исходника (w×h). Возвращает пиксели ARGB размера outW×outH. */
    public static int[] process(int[] argb, int w, int h, int outW, int outH, boolean removeLines) {
        float[] gray = new float[w * h];
        for (int i = 0; i < gray.length; i++) {
            int c = argb[i];
            gray[i] = (((c >> 16) & 255) * 299 + ((c >> 8) & 255) * 587 + (c & 255) * 114) / 1000f;
        }
        int[] g = resize(gray, w, h, outW, outH);
        int threshold = otsu(g);
        int n = outW * outH;
        boolean[] dark = new boolean[n];
        for (int i = 0; i < n; i++) dark[i] = g[i] <= threshold;
        if (removeLines) {
            boolean[] hl = runs(dark, outW, outH, Math.max(40, outW / 15), true);
            boolean[] vl = runs(dark, outW, outH, Math.max(40, outH / 30), false);
            boolean[] erase = new boolean[n];
            for (int y = 0; y < outH; y++) for (int x = 0; x < outW; x++) {
                int i = y * outW + x;
                if (hl[i] || vl[i]) erase[i] = true;
                if (hl[i]) { if (y > 0) erase[i - outW] = true; if (y + 1 < outH) erase[i + outW] = true; }
                if (vl[i]) { if (x > 0) erase[i - 1] = true; if (x + 1 < outW) erase[i + 1] = true; }
            }
            for (int i = 0; i < n; i++) if (erase[i]) dark[i] = false;
        }
        int[] out = new int[n];
        for (int i = 0; i < n; i++) out[i] = dark[i] ? 0xFF000000 : 0xFFFFFFFF;
        return out;
    }

    private static double lanczos(double x) {
        if (x == 0) return 1;
        if (x <= -3 || x >= 3) return 0;
        double p = Math.PI * x;
        return 3 * Math.sin(p) * Math.sin(p / 3) / (p * p);
    }

    /** Веса свёртки для одной оси (как в Pillow): start[i], count[i], weights[i*stride..]. */
    private static double[][] coefficients(int in, int out) {
        double scale = (double) in / out, filter = Math.max(1, scale), support = 3 * filter;
        int stride = (int) Math.ceil(support) * 2 + 1;
        double[] weights = new double[out * stride], start = new double[out], count = new double[out];
        for (int o = 0; o < out; o++) {
            double center = (o + 0.5) * scale;
            int lo = Math.max(0, (int) (center - support + 0.5)), hi = Math.min(in, (int) (center + support + 0.5));
            double sum = 0;
            for (int i = lo; i < hi; i++) { double v = lanczos((i - center + 0.5) / filter); weights[o * stride + i - lo] = v; sum += v; }
            if (sum != 0) for (int i = lo; i < hi; i++) weights[o * stride + i - lo] /= sum;
            start[o] = lo; count[o] = hi - lo;
        }
        return new double[][]{weights, start, count, {stride}};
    }

    private static int[] resize(float[] src, int w, int h, int ow, int oh) {
        double[][] cx = coefficients(w, ow), cy = coefficients(h, oh);
        int sx = (int) cx[3][0], sy = (int) cy[3][0];
        float[] mid = new float[ow * h];
        for (int y = 0; y < h; y++) for (int o = 0; o < ow; o++) {
            int lo = (int) cx[1][o], c = (int) cx[2][o]; double acc = 0;
            for (int k = 0; k < c; k++) acc += src[y * w + lo + k] * cx[0][o * sx + k];
            mid[y * ow + o] = (float) acc;
        }
        int[] out = new int[ow * oh];
        for (int o = 0; o < oh; o++) {
            int lo = (int) cy[1][o], c = (int) cy[2][o];
            for (int x = 0; x < ow; x++) {
                double acc = 0;
                for (int k = 0; k < c; k++) acc += mid[(lo + k) * ow + x] * cy[0][o * sy + k];
                out[o * ow + x] = (int) Math.max(0, Math.min(255, Math.round(acc)));
            }
        }
        return out;
    }

    static int otsu(int[] g) {
        long[] hist = new long[256];
        for (int v : g) hist[v]++;
        double total = g.length, mt = 0;
        for (int i = 0; i < 256; i++) mt += i * (double) hist[i];
        double w = 0, mu = 0, best = -1; int arg = 127;
        for (int t = 0; t < 256; t++) {
            w += hist[t]; mu += t * (double) hist[t];
            if (w == 0 || w == total) continue;
            double d = mt * w - mu * total, v = d * d / (w * (total - w));
            if (v > best) { best = v; arg = t; }
        }
        return arg;
    }

    /** Отметить пиксели тёмных отрезков длиной ≥ min вдоль строк (horizontal) или столбцов. */
    private static boolean[] runs(boolean[] dark, int w, int h, int min, boolean horizontal) {
        boolean[] mark = new boolean[w * h];
        int lines = horizontal ? h : w, len = horizontal ? w : h;
        for (int a = 0; a < lines; a++) {
            int run = 0;
            for (int b = 0; b <= len; b++) {
                boolean d = b < len && dark[horizontal ? a * w + b : b * w + a];
                if (d) { run++; continue; }
                if (run >= min) for (int k = b - run; k < b; k++) mark[horizontal ? a * w + k : k * w + a] = true;
                run = 0;
            }
        }
        return mark;
    }
}
