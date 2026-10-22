import ru.autohub.app.OcrPreprocess;

/** Проверка предобработки OCR на JVM: линии таблицы стираются, буквы остаются, мелкое фото увеличивается. */
public class OcrPreprocessCheck {
    static void check(boolean ok, String what) { if (!ok) throw new AssertionError(what); System.out.println("ok — " + what); }
    public static void main(String[] args) {
        int w = 600, h = 800; int[] px = new int[w * h];
        java.util.Arrays.fill(px, 0xFFF0EEE8);                        // серый «бумажный» фон
        for (int x = 20; x < 580; x++) { px[200 * w + x] = 0xFF303030; px[201 * w + x] = 0xFF303030; } // линия таблицы
        for (int y = 100; y < 700; y++) px[y * w + 300] = 0xFF303030;  // вертикальная линия
        for (int y = 150; y < 170; y++) for (int x = 50; x < 54; x++) px[y * w + x] = 0xFF101010; // «буква»
        int[] size = OcrPreprocess.targetSize(w, h, 2400, 8_000_000L);
        check(size[1] == 2400 && size[0] == 1800, "мелкое фото увеличено до 2400 px по длинной стороне");
        int[] lim = OcrPreprocess.targetSize(4000, 3000, 3000, 2_000_000L);
        check((long) lim[0] * lim[1] <= 2_000_000L + 4000, "ограничение по мегапикселям");
        int ow = size[0], oh = size[1];
        int[] out = OcrPreprocess.process(px, w, h, ow, oh, true);
        int k = 3; // масштаб 600→1800
        check(out[(160 * k) * ow + 52 * k] == 0xFF000000, "буква осталась чёрной");
        check(out[(200 * k + 1) * ow + 150 * k] == 0xFFFFFFFF, "горизонтальная линия стёрта");
        check(out[(400 * k) * ow + 300 * k + 1] == 0xFFFFFFFF, "вертикальная линия стёрта");
        check(out[10 * ow + 10] == 0xFFFFFFFF, "фон белый");
        int[] keep = OcrPreprocess.process(px, w, h, ow, oh, false);
        check(keep[(200 * k + 1) * ow + 150 * k] == 0xFF000000, "без удаления линий линия остаётся");
    }
}
