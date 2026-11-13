declare module 'utif' {
  /** one image file directory of a TIFF: tags as `t<number>` arrays; `data`, `width`, `height` after decodeImage */
  export interface IFD { [tag: string]: unknown; width: number; height: number; data: Uint8Array }
  export function decode(buf: ArrayBuffer | Uint8Array): IFD[]
  export function decodeImage(buf: ArrayBuffer | Uint8Array, ifd: IFD, ifds?: IFD[]): void
  export function toRGBA8(ifd: IFD): Uint8Array
  const UTIF: { decode: typeof decode; decodeImage: typeof decodeImage; toRGBA8: typeof toRGBA8 }
  export default UTIF
}
