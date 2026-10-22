// Повтор OCR-вызовов OfflineOcrEngine.kt на ПК: тот же Tesseract (5.5.1 из Tesseract4Android 4.9.0),
// та же передача пикселей, что в JNI ReadFile.nativeReadBitmap (32 bpp Pix), те же PSM и порядок вызовов.
// replay <каталог с tessdata> <page> <файл.argb> <psm> [<файл.argb> <psm> ...]  — один TessBaseAPI на все проходы, как в движке.
// .argb: int32 w, int32 h (big-endian), затем w*h пикселей ARGB (Java int, big-endian).
// Выход: по строке JSON {"confidence":N,"text":"..."} на проход.
#include <tesseract/baseapi.h>
#include <leptonica/allheaders.h>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
static std::string esc(const char* s) { std::string o; for (; *s; s++) { unsigned char c = *s;
  if (c == '"' || c == '\\') { o += '\\'; o += c; } else if (c == '\n') o += "\\n"; else if (c < 0x20) { char b[8]; snprintf(b, 8, "\\u%04x", c); o += b; } else o += c; } return o; }
static PIX* load(const char* path) {
  FILE* f = fopen(path, "rb"); if (!f) return nullptr;
  unsigned char hdr[8]; if (fread(hdr, 1, 8, f) != 8) { fclose(f); return nullptr; }
  int w = (hdr[0]<<24)|(hdr[1]<<16)|(hdr[2]<<8)|hdr[3], h = (hdr[4]<<24)|(hdr[5]<<16)|(hdr[6]<<8)|hdr[7];
  std::vector<unsigned char> buf((size_t)w*h*4); size_t n = fread(buf.data(), 1, buf.size(), f); fclose(f); if (n != buf.size()) return nullptr;
  PIX* pix = pixCreate(w, h, 32); l_uint32* d = pixGetData(pix); int wpl = pixGetWpl(pix);
  for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { const unsigned char* p = &buf[((size_t)y*w + x)*4];
    d[y*wpl + x] = ((l_uint32)p[1] << L_RED_SHIFT) | ((l_uint32)p[2] << L_GREEN_SHIFT) | ((l_uint32)p[3] << L_BLUE_SHIFT) | ((l_uint32)p[0] << L_ALPHA_SHIFT); }
  return pix;
}
int main(int argc, char** argv) {
  if (argc < 5 || argc % 2 == 0) { fprintf(stderr, "replay <datapath> <page> <file.argb> <psm> ...\n"); return 2; }
  tesseract::TessBaseAPI api;
  if (api.Init(argv[1], "rus+eng", tesseract::OEM_LSTM_ONLY)) return 4;
  int page = atoi(argv[2]);
  for (int i = 3; i + 1 < argc; i += 2) {
    PIX* pix = load(argv[i]); if (!pix) return 3;
    api.SetPageSegMode((tesseract::PageSegMode) atoi(argv[i + 1]));
    api.SetImage(pix);
    char* hocr = api.GetHOCRText(page); delete[] hocr;  // getHOCRText(pageCount - 1), затем getUTF8Text
    char* text = api.GetUTF8Text();
    printf("{\"confidence\":%d,\"text\":\"%s\"}\n", api.MeanTextConf(), esc(text ? text : "").c_str());
    delete[] text; api.Clear(); pixDestroy(&pix);
  }
  api.End(); return 0;
}
