declare module 'gl-transitions' {
  /** Ein Eintrag der gl-transitions-Sammlung (MIT / BSD). */
  export type GlTransition = {
    name: string;
    glsl: string;
    author: string;
    license: string;
    /** Uniform-Name -> GLSL-Typ, z. B. { smoothness: 'float', direction: 'vec2' } */
    paramsTypes: Record<string, string>;
    defaultParams: Record<string, number | boolean | number[]>;
    createdAt?: string;
    updatedAt?: string;
  };

  const transitions: GlTransition[];
  export default transitions;
}
