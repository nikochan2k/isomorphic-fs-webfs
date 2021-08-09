import { util } from "isomorphic-fs";

export function dataUrlToBase64(dataUrl: string) {
  const index = dataUrl.indexOf(",");
  if (0 <= index) {
    return dataUrl.substr(index + 1);
  }
  return dataUrl;
}

async function blobToBase64(blob: Blob): Promise<string> {
  if (blob.size === 0) {
    return "";
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = function (ev) {
      reject(reader.error || ev);
    };
    reader.onload = function () {
      const base64 = dataUrlToBase64(reader.result as string);
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
  return base64;
}

async function blobToArrayBufferUsingReadAsArrayBuffer(blob: Blob) {
  if (blob.size === 0) {
    return new ArrayBuffer(0);
  }
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (ev) => {
      reject(reader.error || ev);
    };
    reader.onload = () => {
      resolve(reader.result as ArrayBuffer);
    };
    reader.readAsArrayBuffer(blob);
  });
  return buffer;
}

async function blobToArrayBufferUsingReadAsDataUrl(blob: Blob) {
  const base64 = await blobToBase64(blob);
  if (!base64) {
    return util.EMPTY_ARRAY_BUFFER;
  }

  return util.toArrayBuffer(base64, "base64");
}

export async function toArrayBuffer(blob: Blob) {
  if (blob.size === 0) {
    return util.EMPTY_ARRAY_BUFFER;
  }

  let buffer: ArrayBuffer;
  if (navigator && navigator.product === "ReactNative") {
    buffer = await blobToArrayBufferUsingReadAsDataUrl(blob);
  } else {
    buffer = await blobToArrayBufferUsingReadAsArrayBuffer(blob);
  }
  return buffer;
}
