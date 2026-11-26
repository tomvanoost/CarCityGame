declare module 'virtual:model-versions' {
  /** Content hash per file under public/models, keyed by URL path (e.g. "/models/vehicles/golfo-2025.glb"). */
  const versions: Record<string, string>;
  export default versions;
}
