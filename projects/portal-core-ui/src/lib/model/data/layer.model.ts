import { CSWRecordModel } from './cswrecord.model';
import { ImagerySplitDirection } from 'cesium';

/**
 * A representation of a layer
 */
export class LayerModel {
  cswRecords: CSWRecordModel[];
  capabilityRecords: any;
  description: string;
  feature_count: number;
  group: string;
  hidden: boolean;
  id: string;
  csLayers: any;
  layerMode: string;
  name: string;
  order: string;
  proxyCountUrl: string;
  proxyDownloadUrl: string;
  proxyGetFeatureInfoUrl: string;
  proxyStyleUrl: string;
  proxyUrl: string;
  relatedRecords: any;
  singleTile: boolean;
  staticLegendUrl: boolean;
  iconUrl: string;
  filterCollection: any;
  stackdriverFailingHosts: string[];
  ogcFilter: String;
  wfsUrls: String[];
  sldBody: string;
  clickCSWRecordsIndex: number[];
  clickPixel: any;
  clickCoord: any;
  // ImagerySplitDirection.[LEFT|RIGHT|NONE], NONE by default, made optional for compatibility
  splitDirection?: ImagerySplitDirection;
}
