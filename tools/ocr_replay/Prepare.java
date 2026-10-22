import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.*;
import ru.autohub.app.OcrPreprocess;

/**
 * Повтор подготовки страницы из OfflineOcrEngine.kt на ПК: декодирование (inSampleSize до ~4 Мп),
 * подложка белым, затем OcrPreprocess (тот же Java-класс, что компилируется в APK).
 * Prepare <фото> <выходной каталог> <longSide:removeLines>...  →  печатает "<w> <h>" исходника и пишет pass-N.argb
 */
public class Prepare {
    public static void main(String[] a) throws Exception {
        BufferedImage src = ImageIO.read(new File(a[0]));
        int sample = 1;
        while ((long) src.getWidth() * src.getHeight() / ((long) sample * sample) > 4_000_000L) sample *= 2;
        int w = src.getWidth() / sample, h = src.getHeight() / sample;
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
