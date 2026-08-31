import {
  createOpenGraphImage,
  openGraphImageContentType,
  openGraphImageSize,
} from "../_components/open-graph-image";

export const alt = "DeepDeck open-source desktop client for DeepSeek Harness";
export const size = openGraphImageSize;
export const contentType = openGraphImageContentType;

export default function OpenGraphImage() {
  return createOpenGraphImage("en");
}
