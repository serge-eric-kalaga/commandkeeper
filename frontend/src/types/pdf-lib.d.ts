declare module "pdf-lib" {
    // Fallback declaration for editor/tsserver when node_modules is not present locally.
    // Runtime dependency is still provided by the frontend container.
    // If you install dependencies locally, this file can be removed.
    export const PDFDocument: any;
    export const StandardFonts: any;
    export const rgb: any;
}
