export interface SiteDataBase {
  urlPrefix: string;
  urlSuffix: string;
  from: number;
  to: number;
  materials: string;
  procedures: string;
  proceduresChildren?: {
    num: string;
    desc: string;
  }
  fixDigit?: number;
}

export type SiteDataMaterialNameAndQuantityInSingleDOM = SiteDataBase & {
  materialsDelimiter: string;
}

export type SiteDataMaterialNameAndQuantityInSeparateDOM = SiteDataBase & {
  materialsName: string;
  materialsQuantity: string;
}

export type SiteData = SiteDataMaterialNameAndQuantityInSingleDOM | SiteDataMaterialNameAndQuantityInSeparateDOM;

export const allSiteData = require('../recipes/site-data.json') as { [siteName: string]: SiteData; };

export function materialsNameAndQuantityInSingleDOM(data: SiteData): data is SiteDataMaterialNameAndQuantityInSingleDOM {
  return !!(data as any).materialsDelimiter;
}

const dummyElement = {} as { textContent?: string; };
export function getMaterialsNameAndQuantity(material: Element, siteData: SiteData): { name?: string; quantity?: string; } {
  let name: string | undefined, quantity: string | undefined;
  if (materialsNameAndQuantityInSingleDOM(siteData)) {
    const { materialsDelimiter } = siteData;
    [name, quantity] = (material.textContent || '').split(materialsDelimiter);
  } else {
    const { materialsName, materialsQuantity } = siteData;
    name = (material.querySelector(materialsName) || dummyElement).textContent || undefined;
    quantity = (material.querySelector(materialsQuantity) || dummyElement).textContent || undefined;
  }
  return { name, quantity };
}