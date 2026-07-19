/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDPDF_URL?: string;
  readonly VITE_CLOUDPDF_TOKEN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
