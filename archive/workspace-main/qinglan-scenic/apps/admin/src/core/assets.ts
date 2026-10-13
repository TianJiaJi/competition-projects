import { scenicArtCatalogue, scenicArtUrl } from "@scenic/ui/scenic-art/catalogue";
import type { AssetItem } from "./types";

/**
 * 随包素材清单：全部指向 apps/admin/public 下自带的本地静态资源，
 * 不依赖未提供的 /assets/scenic/*.webp 示例路径。
 */
export const assetCatalogue: AssetItem[] = [
  {
    id: "asset-landscape",
    title: "青岚山境 · 山峦示意图",
    url: "/assets/scenic-landscape.svg",
    alt: "青绿设色的山峦与云雾示意图",
  },
  {
    id: "asset-creek",
    title: "听溪台 · 溪谷示意图",
    url: "/assets/scenic-creek.svg",
    alt: "溪流绕过青石的示意图",
  },
  {
    id: "asset-gorge",
    title: "叠翠峡 · 峡谷示意图",
    url: "/assets/scenic-gorge.svg",
    alt: "层叠石壁夹出一线山色的示意图",
  },
  {
    id: "asset-summit",
    title: "望岳台 · 山巅示意图",
    url: "/assets/scenic-summit.svg",
    alt: "山顶远望山峦与湖泊的示意图",
  },
  ...scenicArtCatalogue.filter(item => !['landscape', 'creek', 'gorge', 'summit'].includes(item.id)).map(item => ({
    id: `asset-${item.id}`, title: `${item.name} · 景观插画`, url: scenicArtUrl(item.id), alt: item.alt,
  })),
];

export const defaultCoverUrl = assetCatalogue[0].url;

export function assetByUrl(url: string): AssetItem | undefined {
  return assetCatalogue.find((item) => item.url === url);
}

export function assetTitle(url: string): string {
  const asset = assetByUrl(url);
  return asset ? asset.title : url;
}
