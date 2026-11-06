import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.*;
import ru.autohub.app.OcrPreprocess;

/**
 * Повтор подготовки страницы из OfflineOcrEngine.kt на ПК: декодирование (inSampleSize как в sampleSize():
 * длинная сторона не меньше 2400 px, в памяти не больше 12 Мп),
 * подложка белым, затем OcrPreprocess (тот же Java-класс, что компилируется в APK).
 * Prepare <фото> <выходной каталог> <longSide:removeLines>...  →  печатает "<w> <h>" исходника и пишет pass-N.argb
 */
public class Prepare {
    /** То же, что OfflineOcrEngine.sampleSize(): MIN_LONG_SIDE = 2400, MAX_DECODED_PIXELS = 12 Мп. */
    static int sampleSize(int width, int height) {
        int longSide = Math.max(width, height), sample = 1;
        while (longSide / (sample * 2) >= 2400) sample *= 2;
        while ((long) ((width + sample - 1) / sample) * ((height + sample - 1) / sample) > 12_000_000L) sample *= 2;
        return sample;
    }
    public static void main(String[] a) throws Exception {
        BufferedImage src = ImageIO.read(new File(a[0]));
        int sample = sampleSize(src.getWidth(), src.getHeight());
        int w = (src.getWidth() + sample - 1) / sample, h = (src.getHeight() + sample - 1) / sample;
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics(); g.setColor(Color.WHITE); g.fillRect(0, 0, w, h);
        g.drawImage(src, 0, 0, w, h, null); g.dispose();
        int[] px = img.getRGB(0, 0, w, h, null, 0, w);
        System.out.println(w + " " + h);
        for (int i = 2; i < a.length; i++) {
            String[] spec = a[i].split(":");
            int longSide = Integer.parseInt(spec[0]); boolean lines = Boolean.parseBoolean(spec[1]); boolean bin = spec.length < 3 || Boolean.parseBoolean(spec[2]);
            int ow = w, oh = h; int[] out = px;
            if (longSide > 0) { int[] s = OcrPreprocess.targetSize(w, h, longSide, 8_000_000L); ow = s[0]; oh = s[1]; out = OcrPreprocess.process(px, w, h, ow, oh, lines, bin); }
            try (DataOutputStream o = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(new File(a[1], "pass-" + (i - 2) + ".argb"))))) {
                o.writeInt(ow); o.writeInt(oh); for (int v : out) o.writeInt(v);
            }
        }
    }
}
