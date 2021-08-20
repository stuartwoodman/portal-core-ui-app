import { throwError as observableThrowError, Observable } from 'rxjs';

import { catchError, map } from 'rxjs/operators';
import { Injectable, Inject } from '@angular/core';
import { LayerModel } from '../../model/data/layer.model';
import { OnlineResourceModel } from '../../model/data/onlineresource.model';
import { LayerHandlerService } from '../cswrecords/layer-handler.service';
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';

import * as olProj from 'ol/proj';
import * as extent from 'ol/extent';
import { Constants, ResourceType } from '../../utility/constants.service';
import { UtilitiesService } from '../../utility/utilities.service';
import { RenderStatusService } from '../cesium-map/renderstatus/render-status.service';
import { MinTenemStyleService } from '../style/wms/min-tenem-style.service';
import { MapsManagerService, AcMapComponent } from 'angular-cesium';
import { WebMapServiceImageryProvider, ImageryLayer, Resource, Rectangle } from 'cesium';
import { LayerStatusService } from '../../utility/layerstatus.service';

import * as when from 'when';
import TileProviderError from 'cesium/Source/Core/TileProviderError';

export class ErrorPayload {
  constructor(
     public cmWmsService: CsWMSService,
     public layer: LayerModel) {}

  /**
 * Logs an error to console if WMS could not load on map
 * @param evt event
 */
  public errorEvent(evt) {
    console.error('ERROR! evt = ', evt);
    const error : TileProviderError = evt;
    const rss: RenderStatusService = this.cmWmsService.getRenderStatusService();
    rss.getStatusBSubject(this.layer).value.setErrorMessage(error.error.message);
  }  
}

/**
 * Use Cesium to add layer to map. This service class adds WMS layer to the map
 */
@Injectable()
export class CsWMSService {

  private map: AcMapComponent;

  private tileLoadUnsubscribes: Map<string, any> = new Map<string, any>();

  constructor(
    private layerHandlerService: LayerHandlerService,
    private http: HttpClient,
    private renderStatusService: RenderStatusService,
    private mapsManagerService: MapsManagerService,
    private layerStatusService: LayerStatusService,
    @Inject('env') private env,
    @Inject('conf') private conf
  ) { }

  public getRenderStatusService(): RenderStatusService {
    return this.renderStatusService;
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
   * @param layer the WMS layer
   * @param onlineResource where the request will be sent
   * @param param request parameters
   * @param usePost true if parameters are very long and a POST request may be required
   * @param sld_body associated styling parameter sld_body
   */
  public getWMS1_3_0param(
    layer: LayerModel,
    onlineResource: OnlineResourceModel,
    param: any,
    usePost: boolean,
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

    // Add in time parameter, but only if required
    if (param && param.time) {
      params['time'] = param.time;
    }

    if (sld_body) {
      /* ArcGIS and POST requests cannot read base64 encoded styles */
      if (!UtilitiesService.isArcGIS(onlineResource) && this.wmsUrlTooLong(sld_body, layer) && !usePost) {
        params['sld_body'] = window.btoa(sld_body);
      } else {
        params['sld_body'] = sld_body;
      }
    } else {
      params['sldUrl'] = this.getSldUrl(layer, param);
    }
    return params;
  }


  /**
   * get wms 1.1.0 related parameter
   * @param layer the WMS layer
   * @param onlineResource where the request will be sent
   * @param param request parameters
   * @param usePost true if parameters are very long and a POST request may be required
   * @param sld_body associated styling parameter sld_body
   */
  public getWMS1_1param(
    layer: LayerModel,
    onlineResource: OnlineResourceModel,
    param: any,
    usePost: boolean,
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

    // Add in time parameter, but only if required
    if (param && param.time) {
      params['time'] = param.time;
    }

    if (sld_body) {
      /* ArcGIS and POST requests cannot read base64 encoded styles */
      if (!UtilitiesService.isArcGIS(onlineResource) && this.wmsUrlTooLong(sld_body, layer) && !usePost) {
        params['sld_body'] = window.btoa(sld_body);
      } else {
        params['sld_body'] = sld_body;
      }
    } else {
      params['sldUrl'] = this.getSldUrl(layer, param);
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
      return new Observable(observer => {
        param.styles = 'mineralTenementStyle';
        const x = MinTenemStyleService.getMineralTenementsSld(onlineResource.name, param.styles, param.ccProperty);
        observer.next(x);
        observer.complete();
      });
    }

    if (!sldUrl) {
      return new Observable(observer => {
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
   * @param layer layer
   * @param param filter request parameters
   * @return a observable of the HTTP request
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
   * @param param - OPTIONAL - parameter to be passed into retrieving the SLD.Used in capdf
   * @return url - getUrl to retrieve sld
   */
  private getSldUrl(
    layer: LayerModel,
    param?: any
  ) {
    if (layer.proxyStyleUrl) {
      let httpParams = Object.getOwnPropertyNames(param).reduce(
        (p, key1) => p.set(key1, param[key1]),
        new HttpParams()
      );
      httpParams = UtilitiesService.convertObjectToHttpParam(httpParams, param);
      return '/' + layer.proxyStyleUrl + '?' + httpParams.toString();
    }
    return null;
  }

  /**
   * Removes wms layer from the map
   * @method rmLayer
   * @param layer the WMS layer to remove from the map.
   */
  public rmLayer(layer: LayerModel): void {
    // Unsubscribe from tile load listeners
    const wmsOnlineResources = this.layerHandlerService.getWMSResource(layer);
    for (const wmsOnlineResource of wmsOnlineResources) {
      if (this.tileLoadUnsubscribes[wmsOnlineResource.url]) {
        this.tileLoadUnsubscribes[wmsOnlineResource.url]();
        delete this.tileLoadUnsubscribes[wmsOnlineResource.url];
      }
    }
    this.map = this.mapsManagerService.getMap();
    const viewer = this.map.getCesiumViewer();
    if (layer.csLayers) {
      for (const imgLayer of layer.csLayers) {
        viewer.imageryLayers.remove(imgLayer);
      }
    }
    layer.csLayers = [];
    this.renderStatusService.resetLayer(layer.id);
  }

  /**
   * Set layer opacity
   * @method setOpacity
   * @param layer layer whose opacity is to be changed
   */
  public setOpacity(layer: LayerModel, opacity: number) {
    for (const imgLayer of layer.csLayers) {
      imgLayer.alpha = opacity;
    }
  }

  /**
   * Add a WMS layer to the map
   * @method addLayer
   * @param layer the WMS layer to add to the map.
   * @param param request parameters
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
      if (this.layerStatusService.isEndpointFailing(layer.id, wmsOnlineResource)) {
        this.renderStatusService.addResource(layer, wmsOnlineResource);
        this.renderStatusService.updateComplete(layer, wmsOnlineResource, true);
        continue;
      }
      this.renderStatusService.register(layer, wmsOnlineResource);
      this.renderStatusService.addResource(layer, wmsOnlineResource);
      // Collate parameters for style request
      const collatedParam = UtilitiesService.collateParam(layer, wmsOnlineResource, param);
      // Set 'usePost' if style request parameters are too long
      const usePost = this.wmsUrlTooLong(this.env.portalBaseUrl + layer.proxyStyleUrl + collatedParam.toString(), layer);
      // Perform request for style data
      this.getSldBody(layer.proxyStyleUrl, usePost, wmsOnlineResource, collatedParam).subscribe(
        response => {
          const longResp = this.wmsUrlTooLong(response, layer);
          // Create parameters for add layer request
          const params = wmsOnlineResource.version.startsWith('1.3')
            ? this.getWMS1_3_0param(layer, wmsOnlineResource, collatedParam, longResp, response)
            : this.getWMS1_1param(layer, wmsOnlineResource, collatedParam, longResp, response);
          let lonlatextent;
          if (wmsOnlineResource.geographicElements.length > 0) {
            const cswExtent = wmsOnlineResource.geographicElements[0];
            lonlatextent = extent.buffer([cswExtent.westBoundLongitude, cswExtent.southBoundLatitude, cswExtent.eastBoundLongitude,
                                              cswExtent.northBoundLatitude], 2);
            lonlatextent = extent.getIntersection(lonlatextent, [-180, -90, 180, 90]);
          } else {
            // if extent isnt contained in the csw record then use global extent
            lonlatextent = [-180, -90, 180, 90];
            // the current view extent cannot be used as the bounds for the layer because the user could zoom out
            // after adding the layer to the map.
          }

          // Perform add layer request
          layer.csLayers.push(this.addCesiumLayer(layer, wmsOnlineResource, params, longResp,lonlatextent));
          layer.sldBody = response;
        });
    }
  }

    /**
     * Calls CesiumJS to add WMS layer to the map
     * @method addCesiumLayer
     * @param layer the WMS layer to add to the map.
     * @param wmsOnlineResource details of WMS service
     * @param usePost whether to use a POST request
     * @param lonlatextent longitude latitude extent of the layer as an array [west,south,east,north]
     * @returns the new CesiumJS ImageryLayer object
     */
    private addCesiumLayer(layer, wmsOnlineResource, params, usePost: boolean, lonlatextent): ImageryLayer {
      const viewer = this.map.getCesiumViewer();
      const me = this;
      if (this.layerHandlerService.contains(layer, ResourceType.WMS)) {
        // WMS tile loading callback function, l = number of tiles left to load
        const tileLoading = (l: number) => {
          if (l === 0) {
              // When there are no more tiles to load it is complete
              this.renderStatusService.updateComplete(layer, wmsOnlineResource);
          }
        };
        // Register tile loading callback function
        this.tileLoadUnsubscribes[wmsOnlineResource.url] = viewer.scene.globe.tileLoadProgressEvent.addEventListener(tileLoading);

        const url = UtilitiesService.rmParamURL(wmsOnlineResource.url);
        let wmsImagProv;

        // Set up WMS service
        if (!usePost || UtilitiesService.isArcGIS(wmsOnlineResource) ) {
          // NB: ArcGisMapServerImageryProvider does not allow additional parameters for ArcGIS, i.e. no styling
          // So we use a normal GET request & WebMapServiceImageryProvider instead
          wmsImagProv = new WebMapServiceImageryProvider({
            url: url,
            layers: wmsOnlineResource.name,
            parameters: params
          });
        } else {

          // Keep old function call
          let oldCreateImage = (Resource as any)._Implementations.createImage;

          // Overwrite CesiumJS 'createImage' function to allow us to do 'POST' requests via a proxy
          // If there is a 'usepost' parameter in the URL, then 'POST' via proxy else uses standard 'GET'
          // TODO: Implement a Resource constructor parameter instead of 'usepost'
          (Resource as any)._Implementations.createImage = function (request, crossOrigin, deferred, flipY, preferImageBitmap) {
            const jURL = new URL(request.url);
            // If there's no 'usepost' parameter then call the old 'createImage' method which uses 'GET'
            if (!jURL.searchParams.has('usepost')) {
              return oldCreateImage(request, crossOrigin, deferred, flipY, preferImageBitmap);
            }
            // Initiate loading WMS tiles via POST & a proxy
            (Resource as any).supportsImageBitmapOptions()
              .then(function (supportsImageBitmap) {
                const responseType = "blob";
                const method = "POST";
                const xhrDeferred = when.defer();
                // Assemble parameters into a form for 'POST' request
                const postForm = new FormData();
                postForm.append('service', 'WMS');
                jURL.searchParams.forEach(function(val, key) {
                  if (key === 'url') {
                    postForm.append('url', val.split('?')[0] + '?service=WMS');
                    const kvp = val.split('?')[1];
                    if (kvp) {
                      me.paramSubst(kvp.split('=')[0], kvp.split('=')[1], postForm);
                    }
                  } else {
                    me.paramSubst(key, val, postForm);
                  }
                });

                const newURL = jURL.origin + jURL.pathname;
                // Initiate request
                const xhr = (Resource as any)._Implementations.loadWithXhr(
                  newURL,
                  responseType,
                  method,
                  postForm,
                  undefined,
                  xhrDeferred,
                  undefined,
                  undefined,
                  undefined
                );

                if (xhr && xhr.abort) {
                  request.cancelFunction = function () {
                    xhr.abort();
                  };
                }
                return xhrDeferred.promise.then(function (blob) {
                  if (!blob) {
                    deferred.reject(
                      new Error("Successfully retrieved " + url + " but it contained no content.")
                    );
                    return;
                  }
                  const browserName = UtilitiesService.getBrowserName();
                  if (browserName === 'Safari' || browserName === 'Firefox'){
                    return createImageBitmap(blob);
                  } else {
                    // This was not working in Firefox/Safari due to bug: https://bugzilla.mozilla.org/show_bug.cgi?id=1367251
                    // TODO: Remove if condition and use just this if the createImageBitmap bug gets fixed
                    return (Resource as any).createImageBitmapFromBlob(blob, {
                      flipY: flipY,
                      premultiplyAlpha: false,
                    });
                  }
                }).then(deferred.resolve);
              }).otherwise(deferred.reject);
          };
          /* End of 'createImage' overwrite */

          // Create a resource which uses our custom proxy
          const res = new Resource({url: url, proxy: new MyDefaultProxy(me.env.portalBaseUrl + 'getWMSMapViaProxy.do?url=')});

          // Force Resource to use 'POST' and our proxy
          params['usepost'] = true;
          wmsImagProv = new WebMapServiceImageryProvider({
            url: res,
            layers: wmsOnlineResource.name,
            parameters: params,
            rectangle: Rectangle.fromDegrees(lonlatextent[0], lonlatextent[1], lonlatextent[2], lonlatextent[3])
          });
        }
        const errorPayload = new ErrorPayload( this, layer);

        wmsImagProv.errorEvent.addEventListener(errorPayload.errorEvent, errorPayload);
        return viewer.imageryLayers.addImageryProvider(wmsImagProv);
      }
      return null;
    }

    /**
     * Function to add parameters to FormData object
     * some parameters are converted to something that geoserver WMS can understand
     * @method paramSubst
     * @param key parameter key
     * @param val parameter value
     * @param postForm a FormData object to add key,val pairs to
     */
    private paramSubst(key: string, val: string, postForm: FormData) {
      if (key === 'layers') {
        postForm.append('layer', val);
      } else if (key === 'sld_body') {
        postForm.append('sldBody', val);
      } else if (key !== 'usepost') {
        postForm.append(key, val);
      }
    }

}

// Substitute our own proxy class to replace Cesium's 'Proxy' class
// so that the parameters are not uuencoded
class MyDefaultProxy {
  proxy: string;
  constructor(proxy) {
  this.proxy = proxy;
  }
  getURL: (any) => any;
}
MyDefaultProxy.prototype.getURL = function(resource) {
  const prefix = this.proxy.indexOf('?') === -1 ? '?' : '';
  return this.proxy + prefix + resource;
};

