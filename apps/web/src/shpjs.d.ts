declare module 'shpjs' {
  const shp: (input: ArrayBuffer) => Promise<unknown>;
  export default shp;
}
