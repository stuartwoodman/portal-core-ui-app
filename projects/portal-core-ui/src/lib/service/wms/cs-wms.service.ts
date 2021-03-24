import { throwError as observableThrowError, Observable } from 'rxjs';

import { catchError, map } from 'rxjs/operators';
import { Injectable, Inject } from '@angular/core';
import { LayerModel } from '../../model/data/layer.model';
import { OnlineResourceModel } from '../../model/data/onlineresource.model';
import { LayerHandlerService } from '../cswrecords/layer-handler.service';
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';

import * as olProj from 'ol/proj';
import * as extent from 'ol/extent';
import { Constants } from '../../utility/constants.service';
import { UtilitiesService } from '../../utility/utilities.service';
import { RenderStatusService } from '../cesium-map/renderstatus/render-status.service';
import { MinTenemStyleService } from '../style/wms/min-tenem-style.service';
import { MapsManagerService, AcMapComponent } from 'angular-cesium';
import { WebMapServiceImageryProvider, ImageryLayer, ArcGisMapServerImageryProvider, Resource } from 'cesium';

/**
 * Use Cesium to add layer to map. This service class adds WMS layer to the map
 */
@Injectable()
export class CsWMSService {
  private map: AcMapComponent;
  constructor(
    private layerHandlerService: LayerHandlerService,
    private http: HttpClient,
    private renderStatusService: RenderStatusService,
    private mapsManagerService: MapsManagerService,
    @Inject('env') private env,
    @Inject('conf') private conf

  ) { 
  }


  /**
   * A private helper used to check if the URL is too long
   */
  private wmsUrlTooLong(sldBody: string, layer: LayerModel): boolean {
    return (
      encodeURIComponent(sldBody).length > Constants.WMSMAXURLGET ||
      this.conf.forceAddLayerViaProxy.includes(layer.id)
    );
  }


  /**
   * Get WMS 1.3.0 related parameter
   * @param layers the wms layer
   * @param sld_body associated sld_body
   */
  public getWMS1_3_0param(
    layer: LayerModel,
    onlineResource: OnlineResourceModel,
    param,
    sld_body?: string
  ): any {
    const params = {
      // VT: if the parameter contains featureType, it mean we are targeting a different featureType e.g capdf layer
      LAYERS:
        param && param.featureType ? param.featureType : onlineResource.name,
      TILED: true,
      DISPLAYOUTSIDEMAXEXTENT: true,
      FORMAT: 'image/png',
      TRANSPARENT: true,
      VERSION: '1.3.0',
      WIDTH: Constants.TILE_SIZE,
      HEIGHT: Constants.TILE_SIZE,
      STYLES: param && param.styles ? param.styles : '',
    };

    if (sld_body) {
      /* ArcGIS cannot read base64 encoded styles */
      if (!UtilitiesService.isArcGIS(onlineResource) && this.wmsUrlTooLong(sld_body, layer)) {
        params['sld_body'] = window.btoa(sld_body);
      } else {
        params['sld_body'] = sld_body;
      }
    } else {
      params['sldUrl'] = this.getSldUrl(layer, onlineResource, param);
    }
    return params;
  }


  /**
   * get wms 1.1.0 related parameter
   * @param layer the WMS layer
   * @param onlineResource details of the online resource
   * @param param WMS parameters
   * @param sld_body associated SLD_BODY
   */
  public getWMS1_1param(
    layer: LayerModel,
    onlineResource: OnlineResourceModel,
    param: any,
    sld_body?: string
  ): any {
    const params = {
      // VT: if the parameter contains featureType, it mean we are targeting a different featureType e.g capdf layer
      LAYERS:
        param && param.featureType ? param.featureType : onlineResource.name,
      TILED: true,
      DISPLAYOUTSIDEMAXEXTENT: true,
      FORMAT: 'image/png',
      TRANSPARENT: true,
      VERSION: '1.1.1',
      WIDTH: Constants.TILE_SIZE,
      HEIGHT: Constants.TILE_SIZE
    };
    if (sld_body) {
      /* ArcGIS cannot read base64 encoded styles */
      if (!UtilitiesService.isArcGIS(onlineResource) && this.wmsUrlTooLong(sld_body, layer)) {
        params['sld_body'] = window.btoa(sld_body);
      } else {
        params['sld_body'] = sld_body;
      }
    } else {
      params['sldUrl'] = this.getSldUrl(layer, onlineResource, param);
    }
    return params;
  }


  /**
   * Get the SLD from the URL
   * @param sldUrl the url containing the SLD
   * @param usePost use a HTTP POST request
   * @param onlineResource details of resource
   * @return an Observable of the HTTP request
   */
  private getSldBody(
    sldUrl: string,
    usePost: Boolean,
    onlineResource: OnlineResourceModel,
    param?: any
  ): Observable<any> {

    // For ArcGIS mineral tenements layer we can get SLD_BODY parameter locally
    if (UtilitiesService.isArcGIS(onlineResource) && onlineResource.name === 'MineralTenement') {
      return Observable.create(observer => {
        param.styles = 'mineralTenementStyle';
        const x = MinTenemStyleService.getMineralTenementsSld(onlineResource.name, param.styles, param.ccProperty);
        observer.next(x);
        observer.complete();
      });
    }

    if (!sldUrl) {
      return Observable.create(observer => {
        observer.next(null);
        observer.complete();
      });
    }

    let httpParams = Object.getOwnPropertyNames(param).reduce(
      (p, key1) => p.set(key1, param[key1]),
      new HttpParams()
    );
    httpParams = UtilitiesService.convertObjectToHttpParam(httpParams, param);
    if (usePost) {
      return this.http
        .get(this.env.portalBaseUrl + sldUrl, {
          responseType: 'text',
          params: httpParams
        })
        .pipe(
          map(response => {
            return response;
          })
        );
    } else {
      return this.http
        .post(this.env.portalBaseUrl + sldUrl, httpParams.toString(), {
          headers: new HttpHeaders().set(
            'Content-Type',
            'application/x-www-form-urlencoded'
          ),
          responseType: 'text'
        })
        .pipe(
          map(response => {
            return response;
          }),
	  catchError((error: HttpResponse<any>) => {
            return observableThrowError(error);
          })
        );
    }
  }


  /**
   * Get the NvclFilter from the URL
   * @param sldUrl the url containing the sld
   * @return a observable of the http request
   */
  public getNvclFilter(layer: LayerModel, param?: any): Observable<any> {
    if (!param) {
      param = {};
    }
    const filterUrl = 'doNvclV2Filter.do';
    const usePost = this.wmsUrlTooLong(
      this.env.portalBaseUrl + filterUrl + param.toString(),
      layer
    );
    if (!filterUrl) {
      return Observable.create(observer => {
        observer.next(null);
        observer.complete();
      });
    }
    let httpParams = Object.getOwnPropertyNames(param).reduce(
      (p, key1) => p.set(key1, param[key1]),
      new HttpParams()
    );
    httpParams = UtilitiesService.convertObjectToHttpParam(httpParams, param);
    if (usePost) {
      return this.http
        .get(this.env.portalBaseUrl + '', {
          responseType: 'text',
          params: httpParams
        })
        .pipe(
          map(response => {
            return response;
          })
        );
    } else {
      return this.http
        .post(this.env.portalBaseUrl + filterUrl, httpParams.toString(), {
          headers: new HttpHeaders().set(
            'Content-Type',
            'application/x-www-form-urlencoded'
          ),
          responseType: 'text'
        })
        .pipe(
          map(response => {
            return response;
          }),
	  catchError((error: HttpResponse<any>) => {
            return observableThrowError(error);
          })
        );
    }
  }


  /**
   * Get the WMS style URL if proxyStyleUrl is valid
   * @method getSldUrl
   * @param layer - the layer we would like to retrieve the SLD for if proxyStyleUrl is defined
   * @param onlineResource - the onlineResource of the layer we are rendering
   * @param param - OPTIONAL - parameter to be passed into retrieving the SLD.Used in capdf
   * @return url - getUrl to retrieve sld
   */
  private getSldUrl(
    layer: LayerModel,
    onlineResource: OnlineResourceModel,
    param?: any
  ) {
    if (layer.proxyStyleUrl) {
      let httpParams = Object.getOwnPropertyNames(param).reduce(
        (p, key1) => p.set(key1, param[key1]),
        new HttpParams()
      );
      httpParams = UtilitiesService.convertObjectToHttpParam(httpParams, param);

      return '/' + layer.proxyStyleUrl + '?' + httpParams.toString();
    } else {
      return null;
    }
  }

  /**
   * Removes wms layer from the map
   * @method rmLayer
   * @param layer the WMS layer to remove from the map.
   */
  public rmLayer(layer: LayerModel): void {
    console.log("rmLayer(", layer, ")");
    this.map = this.mapsManagerService.getMap();
    const viewer = this.map.getCesiumViewer();
    console.log("Before removing have ", viewer.imageryLayers.length, "layers");
    for (const imgLayer of layer.csImgLayers) {
      viewer.imageryLayers.remove(imgLayer);
    }
    console.log("After removing have ", viewer.imageryLayers.length, "layers");
    this.renderStatusService.resetLayer(layer.id)
  }

  /** 
   * Set layer opacity
   * @method setOpacity
   * @param layer layer whose opacity is to be changed
   */
  public setOpacity(layer: LayerModel, opacity: number) {
    for (let imgLayer of layer.csImgLayers) {
      imgLayer.alpha = opacity;
    }   
  }

  /**
   * Add a wms layer to the map
   * @method addLayer
   * @param layer the WMS layer to add to the map.
   */
  public addLayer(layer: LayerModel, param?: any): void {
    if (!param) {
      param = {};
    }
    this.map = this.mapsManagerService.getMap();

    const wmsOnlineResources = this.layerHandlerService.getWMSResource(layer);

    for (const wmsOnlineResource of wmsOnlineResources) {
      if (UtilitiesService.filterProviderSkip(param.optionalFilters, wmsOnlineResource.url)) {
        this.renderStatusService.skip(layer, wmsOnlineResource);
        continue;
      }
      if (UtilitiesService.isEndpointFailing(layer.stackdriverFailingHosts, wmsOnlineResource)) {
        this.renderStatusService.addResource(layer, wmsOnlineResource);
        this.renderStatusService.updateComplete(layer, wmsOnlineResource, true);
        continue;
      }
      const collatedParam = UtilitiesService.collateParam(layer, wmsOnlineResource, param);
      const usePost = this.wmsUrlTooLong(this.env.portalBaseUrl + layer.proxyStyleUrl + collatedParam.toString(), layer);
      this.getSldBody(layer.proxyStyleUrl, usePost, wmsOnlineResource, collatedParam).subscribe(
        response => {
          const me = this;
          const params = wmsOnlineResource.version.startsWith('1.3')
            ? this.getWMS1_3_0param(layer, wmsOnlineResource, collatedParam, response)
            : this.getWMS1_1param(layer, wmsOnlineResource, collatedParam, response);

          let defaultExtent;
          if (wmsOnlineResource.geographicElements.length > 0) {
            const cswExtent = wmsOnlineResource.geographicElements[0];
            let lonlatextent = extent.buffer([cswExtent.westBoundLongitude, cswExtent.southBoundLatitude, cswExtent.eastBoundLongitude,
                                              cswExtent.northBoundLatitude], 2);
            lonlatextent = extent.getIntersection(lonlatextent, [-180, -90, 180, 90]);
            defaultExtent = olProj.transformExtent(lonlatextent, 'EPSG:4326', Constants.MAP_PROJ);
          } else {
            // FIXME: 'defaultExtent' is not the same as above
            const cameraService = this.map.getCameraService();
            const camera = cameraService.getCamera();
            defaultExtent = camera.computeViewRectangle();
          }

          // TODO: Use POST for long requests
          if (this.wmsUrlTooLong(response, layer)) {
            layer.csImgLayers.push(this.addCesiumLayer(layer, wmsOnlineResource, params, true));
          } else {
            layer.csImgLayers.push(this.addCesiumLayer(layer, wmsOnlineResource, params, false));
          }
        });
    }
  }

    /**
     * Logs an error to console if WMS could not load on map
     * @param evt event
     */
    public errorEvent(evt) {
      console.error('ERROR! evt = ', evt);
    }

    /**
     * Calls cesium to add wms layer to the map
     * @method addCesiumLayer
     * @param layer the WMS layer to add to the map.
     * @param wmsOnlineResource details of WMS service
     * @returns the new cesium ImageryLayer object
     */
    private addCesiumLayer(layer, wmsOnlineResource, params, usePost: boolean): ImageryLayer {
      const viewer = this.map.getCesiumViewer();
      if (this.layerHandlerService.containsWMS(layer)) {
        this.renderStatusService.register(layer, wmsOnlineResource);

        let tileLoadFlag = false;
        // WMS tile loading callback function, l = number of tiles left to load
        const tileLoading = (l: number) => {
          if (l == 0) {
              // When there are no more tiles to load it is complete
              this.renderStatusService.updateComplete(layer, wmsOnlineResource);
          } else if (!tileLoadFlag) {
              // Initiate resource loading with render status service
              tileLoadFlag = true;
              this.renderStatusService.addResource(layer, wmsOnlineResource);
          }
        }
        // Register tile loading callback function
        viewer.scene.globe.tileLoadProgressEvent.addEventListener(tileLoading);
        const url = UtilitiesService.rmParamURL(wmsOnlineResource.url);
        let wmsImagProv;
        console.log("params=", params);

        // Set up WMS service
        if (!UtilitiesService.isArcGIS(wmsOnlineResource)) {
          if (!usePost) {
            wmsImagProv = new WebMapServiceImageryProvider({
              url: url,
              layers: wmsOnlineResource.name,
              parameters: params
            });
          } else {
            // TODO: Force use of POST by overriding resource functions
            const res = new Resource({url: url});
            wmsImagProv = new WebMapServiceImageryProvider({
              url: res,
              layers: wmsOnlineResource.name,
              parameters: params
            });
          }
          
        } else {
          // NOTO BENE: CesiumJS does not allow additional parameters for ArcGIS, i.e. no styling
          // So may need to use WebMapServiceImageryProvider instead 
          wmsImagProv = new WebMapServiceImageryProvider({ // ArcGisMapServerImageryProvider({
            url: url,
            layers: wmsOnlineResource.name
        });
      }
        wmsImagProv.errorEvent.addEventListener(this.errorEvent);
        
        const imgLayer = viewer.imageryLayers.addImageryProvider(wmsImagProv);
        console.log("After adding have ", viewer.imageryLayers.length, "layers");
        
        return imgLayer;
      }
      return null;
    }

  }
