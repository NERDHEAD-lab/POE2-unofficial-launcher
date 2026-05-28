/**
 * Renderer-side Font Preview Generator
 * HTML5 Canvas를 사용하여 등록 시점에 폰트 썸네일(PNG)을 생성합니다.
 */
export class FontPreviewGenerator {
  /**
   * 폰트 파일(Blob/File)로부터 미리보기 이미지를 생성하여 Base64(DataURL)로 반환합니다.
   */
  public static async generatePreview(fontFile: File): Promise<string> {
    const fontName = "temp-preview-font-" + Date.now();
    const fontUrl = URL.createObjectURL(fontFile);

    try {
      // 1. 렌더러에 폰트 동적 등록
      const fontFace = new FontFace(fontName, `url(${fontUrl})`);
      const loadedFace = await fontFace.load();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document.fonts as any).add(loadedFace);

      // 2. Canvas 생성 및 렌더링 (800x120)
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context를 생성할 수 없습니다.");

      canvas.width = 800;
      canvas.height = 120;

      // 배경 (투명)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 텍스트 스타일 설정
      ctx.fillStyle = "#ffffff";
      ctx.font = `40px "${fontName}"`;
      ctx.textBaseline = "middle";

      // 텍스트 렌더링
      const previewText = "Path Of Exile 2 - 패스 오브 액자일 2";
      ctx.fillText(previewText, 20, 60);

      const dataUrl = canvas.toDataURL("image/png");

      // Cleanup
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document.fonts as any).delete(loadedFace);

      return dataUrl;
    } catch (err) {
      console.error("Failed to generate font preview in renderer:", err);
      return "";
    } finally {
      URL.revokeObjectURL(fontUrl);
    }
  }
}
