
import {of as observableOf,  Observable } from 'rxjs';

import {map} from 'rxjs/operators';
import {CSWRecordModel} from '../../model/data/cswrecord.model';
import {Injectable, Inject } from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';

import {LayerModel} from '../../model/data/layer.model';
import {OnlineResourceModel} from '../../model/data/onlineresource.model';
import {ResourceType} from '../../utility/constants.service';
import { UtilitiesService } from '../../utility/utilities.service';
import { ImagerySplitDirection } from 'cesium';


/**
 * Service class to handle jobs relating to getting csw records from the server
 *
 */
@Injectable()
export class LayerHandlerService {

  private layerRecord;
  private layerCaps; // A layer's WMS getCapabilities record, indexed on layer name

  constructor(private http: HttpClient, @Inject('env') private env) {
    this.layerRecord = [];
    this.layerCaps = {};
  }

  /**
   * Retrieve csw records from the service and organize them by group
   * @returns a observable object that returns the list of csw record organized in groups
   */
  public getLayerRecord(): Observable<any> {
    const me = this;
    if (this.layerRecord.length > 0) {
        return observableOf(this.layerRecord);
    } else {
      return this.http.get(this.env.portalBaseUrl + this.env.getCSWRecordEndP).pipe(
        map(response => {
            const cswRecord = response['data'];
            cswRecord.forEach(function(item, i, ar) {
              if (me.layerRecord[item.group] === undefined) {
                me.layerRecord[item.group] = [];
              }
              // VT: attempted to cast the object into a typescript class however it doesn't seem like its possible
              // all examples points to casting from json to interface but not object to interface.
              item.expanded = false;
              item.hide = false;
              me.layerRecord[item.group].push(item);
            });
            return me.layerRecord;
        }));
    }
  }

  /**
   * Retrieve the csw record located at the wms serviceurl endpoint.
   * @Return a layer with the retrieved cswrecord wraped in a layer model.
   */
  public getCustomLayerRecord(serviceUrl: string): Observable<any> {
    const me = this;
    const httpParams = new HttpParams().set('serviceUrl', serviceUrl);

    return this.http.get(this.env.portalBaseUrl + this.env.getCustLayersEndP, {
      params: httpParams
    }).pipe(map(response => {
      if (response['success'] === false) {
        return null;
      }
      const cswRecord = response['data']['cswRecords'];
      const itemLayers = [];
      itemLayers['Results'] = [];
      cswRecord.forEach(function(item, i, ar) {
        const itemLayer = new LayerModel();
        itemLayer.cswRecords = [item];
        itemLayer['expanded'] = false;
        itemLayer.id = item.id;
        itemLayer.description = item.description;
        itemLayer.hidden = false;
        itemLayer.layerMode = 'NA';
        itemLayer.name = item.name;
        itemLayer.splitDirection = ImagerySplitDirection.NONE;
        itemLayer.capabilityRecords = response['data']['capabilityRecords'];
        itemLayers['Results'].push(itemLayer);
      });
      return itemLayers;
    }));
  }

  /**
   * Check if layer contains resources of a certain kind (WMS, WFS, IRIS ...)
   * @param layer the layer to query for resource types
   * @param resourceType resource type
   * @return true if resource type exists in layer
   */
  public contains(layer: LayerModel, resourceType: ResourceType): boolean {
    const cswRecords: CSWRecordModel[] = layer.cswRecords;
    for (const cswRecord of cswRecords) {
      for (const onlineResource of cswRecord.onlineResources) {
        if (onlineResource.type === resourceType) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Retrieve the CSW record associated with this layer
   * @param layer the layer to query for wms records
   * @return CSW record all the csw records
   */
  public getCSWRecord(layer: LayerModel): CSWRecordModel[] {
    return layer.cswRecords;
  }

 /**
   * Search and retrieve only wms records
   * @param layer the layer to query for wms records
   */
  public getWMSResource(layer: LayerModel): OnlineResourceModel[] {
       return this.getOnlineResources(layer, ResourceType.WMS);
  }

   /**
   * Search and retrieve only WCS records
   * @param layer the layer to query for wms records
   */
  public getWCSResource(layer: LayerModel): OnlineResourceModel[] {
       return this.getOnlineResources(layer, ResourceType.WCS);
  }

  /**
   * Search and retrieve only wfs records
   * @param layer the layer to query for wfs records
   */
  public getWFSResource (layer: LayerModel): OnlineResourceModel[] {
    return this.getOnlineResources(layer, ResourceType.WFS);
  }

  /**
   * Extract resources based on the type. If type is not defined, return all the resource
   * @method getOnlineResources
   * @param layer - the layer we would like to extract onlineResource from
   * @param resourceType - OPTIONAL a enum of the resource type. The ENUM constant is defined on app.js
   * @return resources - an array of the resource. empty array if none is found
   */
  public getOnlineResources(layer: LayerModel, resourceType?: ResourceType): OnlineResourceModel[] {
    const cswRecords: CSWRecordModel[] = layer.cswRecords;
    const onlineResourceResult = [];
    const uniqueURLSet = new Set<string>();
    for (const cswRecord of cswRecords) {
      for (const onlineResource of cswRecord.onlineResources) {
        // VT: We really just wanted the extent in the cswRecord so that ol only load whats is in the extent.
        onlineResource.geographicElements = cswRecord.geographicElements;
        if (resourceType && onlineResource.type === resourceType) {
          if (!uniqueURLSet.has(onlineResource.url)) {
            onlineResourceResult.push(onlineResource);
            uniqueURLSet.add(onlineResource.url);
          }
        } else if (!resourceType) {
          if (!uniqueURLSet.has(onlineResource.url)) {
            onlineResourceResult.push(onlineResource);
            uniqueURLSet.add(onlineResource.url);
          }
        }
      }
    }
    return onlineResourceResult;
  }

  /**
    * Extract resources based on the type. If type is not defined, return all the resource
    * @method getOnlineResources
    * @param layer - the layer we would like to extract onlineResource from
    * @param resourceType - OPTIONAL a enum of the resource type. The ENUM constant is defined on app.js
    * @return resources - an array of the resource. empty array if none is found
    */
  public getOnlineResourcesFromCSW(cswRecord: CSWRecordModel, resourceType?: ResourceType): OnlineResourceModel[] {

    const onlineResourceResult = [];
    const uniqueURLSet = new Set<string>();

      for (const onlineResource of cswRecord.onlineResources) {
        if (resourceType && onlineResource.type === resourceType) {
          if (!uniqueURLSet.has(onlineResource.url)) {
            onlineResourceResult.push(onlineResource);
            uniqueURLSet.add(onlineResource.url);
          }
        } else if (!resourceType) {
          if (!uniqueURLSet.has(onlineResource.url)) {
            onlineResourceResult.push(onlineResource);
            uniqueURLSet.add(onlineResource.url);
          }
        }
      }

    return onlineResourceResult;
  }

}
