import {
  createOpenGraphImage,
  openGraphImageContentType,
  openGraphImageSize,
} from "../../_components/open-graph-image";

export const alt = "DeepDeck 开源 DeepSeek Harness 桌面客户端";
export const size = openGraphImageSize;
export const contentType = openGraphImageContentType;

export default function OpenGraphImage() {
  return createOpenGraphImage("zh");
}
