declare module '*/kashi-veda-admin/lib/types/puja-catalog' {
  export interface PujaCategoryItem {
    id: string;
    name: string;
    description: string;
    display_order: number;
    [key: string]: any;
  }
  export type PujaCategoryFormData = any;
  export type PujaServiceItem = any;
  export type ServiceMode = 'home' | 'temple' | 'remote';
  export interface PujaServiceFormData {
    id?: string;
    allowed_modes?: ServiceMode[];
    default_duration_minutes?: number | string;
    [key: string]: any;
  }
}

declare module '*/kashi-veda-admin/lib/types/samagri-catalog' {
  export interface SamagriItem {
    id: string;
    name: string;
    description: string;
    [key: string]: any;
  }
  export type SamagriItemFormData = any;
  export type SamagriPackage = any;
  export interface SamagriPackageItemInput {
    samagri_item_id: string;
    quantity: number;
  }
  export interface SamagriPackageFormData {
    id?: string;
    puja_service_id?: string;
    name?: string;
    description?: string;
    is_active?: boolean;
    items?: SamagriPackageItemInput[];
    [key: string]: any;
  }
}
