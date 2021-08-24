import { CSWRecordModel } from '../../model/data/cswrecord.model';
import { Injectable, Inject } from '@angular/core';
import * as olExtent from 'ol/extent';
import * as olProj from 'ol/proj';
import {BehaviorSubject, Subject } from 'rxjs';
import { point } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import bboxPolygon from '@turf/bbox-polygon';
import { LayerModel } from '../../model/data/layer.model';
import { LayerHandlerService } from '../cswrecords/layer-handler.service';
import { ManageStateService } from '../permanentlink/manage-state.service';
import { CsCSWService } from '../wcsw/cs-csw.service';
import { CsWFSService } from '../wfs/cs-wfs.service';
import { CsMapObject } from './cs-map-object';
import { CsWMSService } from '../wms/cs-wms.service';
import { CsWWWService } from '../www/cs-www.service';
import { ResourceType } from '../../utility/constants.service';
import { CsIrisService } from '../kml/cs-iris.service';
import { MapsManagerService, RectangleEditorObservable, EventRegistrationInput, CesiumEvent, PickOptions, EventResult } from 'angular-cesium';
import { Entity, ProviderViewModel, buildModuleUrl, OpenStreetMapImageryProvider, BingMapsStyle, BingMapsImageryProvider,
  ArcGisMapServerImageryProvider, TileMapServiceImageryProvider, Cartesian2, WebMercatorProjection,  ImagerySplitDirection } from 'cesium';
declare var Cesium: any;

/**
 * Wrapper class to provide all things related to the drawing of polygons and bounding boxes in CesiumJS
 */
@Injectable()
export class CsMapService {

  // VT: a storage to keep track of the layers that have been added to the map. This is use to handle click events.
  private layerModelList: Map<string, LayerModel> = new Map<string, LayerModel>();
  private addLayerSubject: Subject<LayerModel>;

  private clickedLayerListBS = new BehaviorSubject<any>({});
  // Cesium map
  private map;

  // If the split map pane is visible or not
  private splitMapShown = false;

  constructor(private layerHandlerService: LayerHandlerService, private csWMSService: CsWMSService,
    private csWFSService: CsWFSService, private csMapObject: CsMapObject, private manageStateService: ManageStateService,
    private csCSWService: CsCSWService, private csWWWService: CsWWWService,
    private csIrisService: CsIrisService, private mapsManagerService: MapsManagerService,
    @Inject('env') private env, @Inject('conf') private conf)  {
    this.csMapObject.registerClickHandler(this.mapClickHandler.bind(this));
    this.addLayerSubject = new Subject<LayerModel>();

  }

  init() {
    this.map = this.mapsManagerService.getMap();
    const eventRegistration: EventRegistrationInput = {
      event: CesiumEvent.LEFT_CLICK
    };
    const mapEventManager = this.mapsManagerService.getMap().getMapEventsManager();
    const clickEvent = mapEventManager.register(eventRegistration).subscribe((result) => {
      this.mapClickHandler(result);
    });
  }

  /**
   * Fetches Cesium 'Viewer'
   */
  public getViewer() {
    return this.mapsManagerService.getMap().getCesiumViewer();
  }

  /**
   * get a observable subject that triggers an event whenever a map is clicked on
   * @returns the observable subject that returns the list of map layers that was clicked on in the format {clickedFeatureList,
   *         clickedLayerList, pixel,clickCoord}
   */
   public getClickedLayerListBS(): BehaviorSubject<any> {
     return this.clickedLayerListBS;
   }

   /**
    * Pick all Entities at the given position
    * @param windowPosition window position of mouse click event
    * @returns an Array of Cesium.Entity objects at specified position
    */
   pickEntities(windowPosition: Cartesian2): Entity[] {
    const pickedPrimitives = this.getViewer().scene.drillPick(windowPosition);
    const result = [];
    const hash = {};
    for (const picked of pickedPrimitives) {
      const entity = Cesium.defaultValue(picked.id, picked.primitive.id);
      if (entity instanceof Cesium.Entity &&
          !Cesium.defined(hash[entity.id])) {
        result.push(entity);
        hash[entity.id] = true;
      }
    }
    return result;
  }

  /**
   * Gets called when a map click event is recognised
   * @param pixel coordinates of clicked on pixel (units: pixels)
   */
  public mapClickHandler(eventResult: EventResult) {
    try {
      const me = this;
      // Filter out drag event
      if (!eventResult.movement ||
          Math.abs(eventResult.movement.startPosition.x - eventResult.movement.endPosition.x) > 2 ||
          Math.abs(eventResult.movement.startPosition.y - eventResult.movement.endPosition.y) > 2) {
        return;
      }
      const pixel = eventResult.movement.startPosition;
      if (!pixel || !pixel.x || !pixel.y) {
        return;
      }
      const mousePosition = new Cartesian2(pixel.x, pixel.y);
      const viewer = this.map.getCesiumViewer();
      const ellipsoid = viewer.scene.globe.ellipsoid;
      const cartesian = viewer.camera.pickEllipsoid(mousePosition, ellipsoid);
      const cartographic = ellipsoid.cartesianToCartographic(cartesian);
      let lon = Cesium.Math.toDegrees(cartographic.longitude);
      let lat = Cesium.Math.toDegrees(cartographic.latitude);
      if (!Number(lat) || !Number(lon)) {
        return;
      }

      lon = Number.parseFloat(lon).toFixed(5);
      lat = Number.parseFloat(lat).toFixed(5);
      const clickCoord = new WebMercatorProjection().project(cartographic);
      // Create a GeoJSON point
      const clickPoint = point([lon, lat]);
      // Compile a list of clicked on layers
      const activeLayers = this.layerModelList;
      const clickedLayerList: LayerModel[] = [];

      // tslint:disable-next-line:forin
      for (const layerId in activeLayers) {
        const layerModel = activeLayers[layerId];

        if (!me.layerHandlerService.contains(layerModel, ResourceType.WMS) &&
            !me.layerHandlerService.contains(layerModel, ResourceType.WWW)) {
          continue;
        }
        const cswRecords = layerModel.cswRecords;
        layerModel.clickCSWRecordsIndex = [];
        for (let i = 0; i < cswRecords.length; i++) {
          if (!cswRecords[i].onlineResources[0]) {
            console.log('error onlineResources:', cswRecords[i].onlineResources);
            continue;
          }
          let bbox = null;
          if (cswRecords[i].onlineResources[0].hasOwnProperty('geographicElements') &&
              cswRecords[i].onlineResources[0].geographicElements.length > 0) {
            bbox = cswRecords[i].onlineResources[0].geographicElements[0];
          } else if (cswRecords[i].hasOwnProperty('geographicElements') && cswRecords[i].geographicElements.length > 0) {
            bbox = cswRecords[i].geographicElements[0];
          }
          if (bbox === null) {
            continue;
          }
          const poly = bboxPolygon([bbox.westBoundLongitude, bbox.southBoundLatitude, bbox.eastBoundLongitude, bbox.northBoundLatitude]);
          if (booleanPointInPolygon(clickPoint, poly)) {
            // Add to list of clicked layers
            layerModel.clickPixel = [pixel.x, pixel.y];
            layerModel.clickCoord = [lon, lat];
            layerModel.clickCSWRecordsIndex.push(i);
          }
        }
        if (layerModel.clickCSWRecordsIndex.length > 0) {
          clickedLayerList.push(layerModel);
        }
      }

      // Compile a list of clicked on entities
      const clickedEntityList: any[] = [];
      const pickedEntities: any[] = this.pickEntities(mousePosition);
      for (const entity of pickedEntities) {
        // TODO: Filter out polygon filter?
        clickedEntityList.push(entity);
      }
      if (clickedEntityList.length || clickedLayerList.length) {
        this.clickedLayerListBS.next({
          clickedEntityList,
          clickedLayerList,
          pixel,
          clickCoord
        });
      }
    } catch (error) {
      throw error;
    }
  }

  /*
   * Return a list of CSWRecordModels present in active layers that intersect
   * the supplied extent.
   * 
   * TODO: Get rid of olExtent and olProj
   *
   * @param extent the extent with which to test the intersection of CSW
   * records
   */
  public getCSWRecordsForExtent(extent: olExtent): CSWRecordModel[] {
    const intersectedCSWRecordList: CSWRecordModel[] = [];
    extent = olProj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');
    const groupLayers = []; // this.map.getLayers(); // FIXME
    const mapLayerColl = []; // this.map.getLayers(); // FIXME
    const me = this;
    mapLayerColl.forEach(function(layer) {
       for (const layerId in groupLayers) {
           for (const activeLayer of groupLayers[layerId]) {
               if (layer === activeLayer) {
                   const layerModel = me.getLayerModel(layerId);
                   /*
                   if (!layerModel || !me.layerHandlerService.containsWMS(layerModel)) {
                      continue;
                   }
                   */
                   for (const cswRecord of layerModel.cswRecords) {
                       let cswRecordIntersects: boolean = false;
                       for (const bbox of cswRecord.geographicElements) {
                           const tBbox = [bbox.westBoundLongitude, bbox.southBoundLatitude, bbox.eastBoundLongitude, bbox.northBoundLatitude];
                           if (olExtent.intersects(extent, tBbox)) {
                               cswRecordIntersects = true;
                           }
                       }
                       if (cswRecordIntersects) {
                           intersectedCSWRecordList.push(cswRecord);
                       }
                   }
               }
           }
        }
     });

    return intersectedCSWRecordList;
  }

  /**
   * Get a list of current map supported OnlineResource types.
   * Excludes config CSW renderer list.
   * @returns a list of supported OnlineResource types as strings
   */
  public getSupportedOnlineResourceTypes(): ResourceType[] {
    return [ResourceType.WMS, ResourceType.IRIS];
  }

  /**
   * Check if a layer is supported to be added to the map
   * @param layer layer to be added to map
   * @returns true if layer is supported, false otherwise
   */
  public isMapSupportedLayer(layer: LayerModel): boolean {
    if (this.conf.cswrenderer && this.conf.cswrenderer.includes(layer.id)) {
      return true;
    }
    for (const resourceType of this.getSupportedOnlineResourceTypes()) {
      if (this.layerHandlerService.contains(layer, resourceType)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Add layer to the wms
   * @param layer the layer to add to the map
   */
  public addLayer(layer: LayerModel, param: any): void {
    // initiate csLayers to prevent undefined errors
    if (!layer.csLayers) {
       layer.csLayers = [];
    }
    this.csMapObject.removeLayerById(layer.id);
    // Add a CSW layer to map
    if (this.conf.cswrenderer && this.conf.cswrenderer.includes(layer.id)) {
      // Remove old existing layer
      if (this.layerExists(layer.id)) {
        this.csCSWService.rmLayer(layer);
        delete this.layerModelList[layer.id];
      }
      // Add layer
      this.csCSWService.addLayer(layer, param);
      this.cacheLayerModelList(layer.id, layer);

    // Add a WMS layer to map
    } else if (this.layerHandlerService.contains(layer, ResourceType.WMS)) {
      // Remove old existing layer
      if (this.layerExists(layer.id)) {
        this.csWMSService.rmLayer(layer);
        delete this.layerModelList[layer.id];
      }
      // Add layer
      this.csWMSService.addLayer(layer, param);
      this.cacheLayerModelList(layer.id, layer);

     // Add a WFS layer to map
     } else if (this.layerHandlerService.contains(layer, ResourceType.WFS)) {
       // FIXME this.csWFSService.addLayer(layer, param);
       // FIXME this.layerModelList[layer.id] = layer;
       // TODO: Add to getSupportedOnlineResourceTypes() when supported

     // Add a WWW layer to map
     } else if (this.layerHandlerService.contains(layer, ResourceType.WWW)) {
       // FIXME this.csWWWService.addLayer(layer, param);
       // FIXME this.layerModelList[layer.id] = layer;
       // TODO: Add to getSupportedOnlineResourceTypes() when supported

     } else if (this.layerHandlerService.contains(layer, ResourceType.IRIS)) {
      // Remove old existing layer
      if (this.layerExists(layer.id)) {
        this.csIrisService.rmLayer(layer);
        delete this.layerModelList[layer.id];
      }
      // Add layer
      this.csIrisService.addLayer(layer, param);
      this.cacheLayerModelList(layer.id, layer);

    } else {
      throw new Error('No Suitable service found');
    }
  }

  /**
   * Add new layer to layer model list
   * @param id layer id
   * @param layer layer
   */
  private cacheLayerModelList(id: string, layer: LayerModel) {
    this.layerModelList[layer.id] = layer;
    this.addLayerSubject.next(layer);
  }

   /**
    *  In the event we have custom layer that is handled outside olMapService, we will want to register that layer here so that
    *  it can be handled by the clicked event handler.
    *  this is to support custom layer renderer such as iris that uses kml
    */
   public appendToLayerModelList(layer) {
     this.cacheLayerModelList(layer.id, layer);
   }

  /**
   * Add layer to the map. taking a short cut by wrapping the csw in a layerModel
   * @param layer the layer to add to the map
   */
   public addCSWRecord(cswRecord: CSWRecordModel): void {
        const itemLayer = new LayerModel();
        itemLayer.cswRecords = [cswRecord];
        itemLayer['expanded'] = false;
        itemLayer.id = cswRecord.id;
        itemLayer.description = cswRecord.description;
        itemLayer.hidden = false;
        itemLayer.layerMode = 'NA';
        itemLayer.name = cswRecord.name;
        itemLayer.splitDirection = ImagerySplitDirection.NONE;
        try {
            this.addLayer(itemLayer, {});
        } catch (error) {
            throw error;
        }
   }

  /**
   * Remove layer from map
   * @param layer the layer to remove from the map
   */
  public removeLayer(layer: LayerModel): void {
      this.manageStateService.removeLayer(layer.id);
      if (this.conf.cswrenderer && this.conf.cswrenderer.includes(layer.id)) {
        this.csCSWService.rmLayer(layer);
      } else if (this.layerHandlerService.contains(layer, ResourceType.IRIS)) {
        this.csIrisService.rmLayer(layer);
      } else {
        this.csWMSService.rmLayer(layer);
      }
      delete this.layerModelList[layer.id];
  }

  /**
   * Retrieve the layer model given an id string
   * @param layerId layer's id string
   */
  public getLayerModel(layerId: string): LayerModel {
      if (this.layerModelList.hasOwnProperty(layerId)) {
          return this.layerModelList[layerId];
      }
      return null;
  }

  /**
   * Check if the layer denoted by layerId has been added to the map
   * @param layerId the ID of the layer to check for
   */
  public layerExists(layerId: string): boolean {
    if (layerId in this.layerModelList) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Find which layer (if any) contains the given Cesium.Entity
   * @param entity the Cesium.Entity
   * @returns the LayerModel containing the Cesium
   */
  public getLayerForEntity(entity: Entity): LayerModel {
    for (const key of Object.keys(this.layerModelList)) {
      const layer = this.layerModelList[key];
      for (const csLayer of layer.csLayers) {
          if (csLayer.entities && csLayer.entities.values.indexOf(entity) !== -1) {
              return layer;
          }
      }
    }
    return null;
  }

  /**
   * Set the opacity of a layer
   * @param layerId the ID of the layer to change opacity
   * @param opacity the value of opacity between 0.0 and 1.0
   */
  public setLayerOpacity(layer: LayerModel, opacity: number) {
    if (this.layerExists(layer.id)) {
      if (this.conf.cswrenderer && this.conf.cswrenderer.includes(layer.id)) {
        this.csCSWService.setOpacity(layer, opacity);
      } else {
        this.csWMSService.setOpacity(layer, opacity);
      }
    }
  }

  /**
   * Retrieve the active layer list
   */
  public getLayerModelList(): Map<string, LayerModel> {
    return this.layerModelList;
  }

  public getAddLayerSubject(): Subject<LayerModel> {
    return this.addLayerSubject;
  }

  /**
   * Fit the map to the extent that is provided
   * @param extent An array of numbers representing an extent: [minx, miny, maxx, maxy]
   */
  public fitView(extent: [number, number, number, number]): void {
    const northWest = olProj.toLonLat([extent[0], extent[1]]);
    const northEast = olProj.toLonLat([extent[2], extent[1]]);
    const southEast = olProj.toLonLat([extent[2], extent[3]]);
    const southWest = olProj.toLonLat([extent[0], extent[3]]);
    const extentPoly = this.getViewer().entities.add({
      polygon : {
        hierarchy : Cesium.Cartesian3.fromDegreesArray([
          northWest[0], northWest[1],
          northEast[0], northEast[1],
          southEast[0], southEast[1],
          southWest[0], southWest[1]
        ]),
        height : 0,
        material : new Cesium.Color(128, 128, 128, 0.25),
        outline : true,
        outlineColor : Cesium.Color.BLACK
      }
    });
    // Leave the highlight for 2 seconds after zooming, then remove
    this.getViewer().zoomTo(extentPoly).then(() => {
      setTimeout(() => {
        this.getViewer().entities.remove(extentPoly);
      }, 2000);
    });
  }

  /**
   * Zoom the map in one level
   */
  public zoomMapIn(): void {
    // FIXME this.csMapObject.zoomIn();
  }

  /**
   * Zoom the map out one level
   */
  public zoomMapOut(): void {
    // FIXME this.csMapObject.zoomOut();
  }

  /**
   * DrawBound
   * @returns a observable object that triggers an event when the user have completed the task
   */
  public drawBound(): RectangleEditorObservable {
    return this.csMapObject.drawBox();
  }

  /**
   * Create a list of base maps from the environment file
   */
  public createBaseMapLayers(): any[] {
    const me = this;
    const baseMapLayers: any[] = [];
    for (const layer of this.env.baseMapLayers) {
      if (layer.layerType === 'OSM') {
        baseMapLayers.push(
          new ProviderViewModel({
            name: layer.viewValue,
            iconUrl: buildModuleUrl('assets/cesium/Widgets/Images/ImageryProviders/openStreetMap.png'),
            tooltip: layer.tooltip,
            creationFunction() {
              return new OpenStreetMapImageryProvider({
                url: 'https://a.tile.openstreetmap.org/',
              });
            },
          })
        );
      } else if (layer.layerType === 'Bing' && this.env.hasOwnProperty('bingMapsKey') &&
                 this.env.bingMapsKey.trim() && this.env.bingMapsKey !== 'Bing_Maps_Key') {
        let bingMapsStyle = BingMapsStyle.AERIAL;
        let bingMapsIcon = '';
        switch (layer.value) {
          case 'Aerial':
            bingMapsStyle = BingMapsStyle.AERIAL;
            bingMapsIcon = 'bingAerial.png';
            break;
          case 'AerialWithLabels':
            bingMapsStyle = BingMapsStyle.AERIAL_WITH_LABELS;
            bingMapsIcon = 'bingAerialLabels.png';
            break;
          case 'Road':
          default:
            bingMapsStyle = BingMapsStyle.ROAD;
            bingMapsIcon = 'bingRoads.png';
            break;
        }
        baseMapLayers.push(
          new ProviderViewModel({
            name: layer.viewValue,
            iconUrl: buildModuleUrl('assets/cesium/Widgets/Images/ImageryProviders/' + bingMapsIcon),
            tooltip: layer.tooltip,
            creationFunction() {
              return new BingMapsImageryProvider({
                url: 'https://dev.virtualearth.net',
                key: me.env.bingMapsKey,
                mapStyle: bingMapsStyle,
                // defaultAlpha: 1.0,
              });
            },
          })
        );
      } else if (layer.layerType === 'ESRI') {
        const esriUrl =
          'https://services.arcgisonline.com/ArcGIS/rest/services/' + layer.value + '/MapServer';
        let esriIcon = '';
        switch (layer.value) {
          case 'World_Imagery':
            esriIcon = 'esriWorldImagery.png';
            break;
          case 'NatGeo_World_Map':
            esriIcon = 'esriNationalGeographic.png';
            break;
          case 'World_Street_Map':
            esriIcon = 'esriWorldStreetMap.png';
            break;
          // No provided icon
          case 'World_Terrain_Base':
            esriIcon = 'esriWorldTerrainBase.png';
            break;
          case 'World_Topo_Map':
            esriIcon = 'esriWorldTopoMap.png';
            break;
          // Only shows internal borders
          case 'Reference/World_Boundaries_and_Places':
            esriIcon = 'esriWorldBoundariesAndPlaces.png';
            break;
          case 'Canvas/World_Dark_Gray_Base':
            esriIcon = 'esriWorldDarkGrayBase.png';
            break;
          case 'Canvas/World_Light_Gray_Base':
            esriIcon = 'esriWorldLightGrayBase.png';
            break;
        }
        baseMapLayers.push(
          new ProviderViewModel({
            name: layer.viewValue,
            iconUrl: buildModuleUrl('assets/cesium/Widgets/Images/ImageryProviders/' + esriIcon),
            tooltip: layer.tooltip,
            creationFunction() {
              return new ArcGisMapServerImageryProvider({
                url: esriUrl,
              });
            },
          })
        );
      } else if (layer.layerType === 'NEII') {
        baseMapLayers.push(
          new ProviderViewModel({
            name: layer.viewValue,
            iconUrl: buildModuleUrl('assets/cesium/Widgets/Images/ImageryProviders/naturalEarthII.png'),
            tooltip: layer.tooltip,
            creationFunction() {
              return new TileMapServiceImageryProvider({
                url: buildModuleUrl('assets/cesium/Assets/Textures/NaturalEarthII'),
              });
            },
          })
        );
      }
    }
    return baseMapLayers;
  }

  /**
   * Set the direction of the split pane that the specified layer is to appear in
   * @param layer the layer to appear in the left, right or both split panes
   * @param splitDirection the direction the layer is to appear in (ImageryLayerSplitDirection.[LEFT|RIGHT|NONE])
   */
  public setLayerSplitDirection(layer: LayerModel, splitDirection: ImagerySplitDirection) {
    layer.splitDirection = splitDirection;
    const viewer = this.map.getCesiumViewer();
    for (const cesiumLayer of layer.csLayers) {
      const layerIndex = viewer.imageryLayers.indexOf(cesiumLayer);
      const imageryLayer = viewer.imageryLayers.get(layerIndex);
      if (imageryLayer !== undefined) {
        imageryLayer.splitDirection = splitDirection;
      }
    }
  }

  /**
   * Is the map split shown?
   */
  public getSplitMapShown(): boolean {
    return this.splitMapShown;
  }

  /**
   * Set whether the map split is shown
   * @param splitMapShown set the map split shown to this value
   */
  public setSplitMapShown(splitMapShown: boolean) {
    this.splitMapShown = splitMapShown;
  }

}
