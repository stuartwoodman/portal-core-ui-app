
import {throwError as observableThrowError,  Observable } from 'rxjs';

import {catchError, map} from 'rxjs/operators';

import { CSWRecordModel } from '../../../lib/model/data/cswrecord.model';
import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { LayerModel } from '../../../lib/model/data/layer.model';
import { OnlineResourceModel } from '../../../lib/model/data/onlineresource.model';
import { LayerHandlerService } from '../../service/cswrecords/layer-handler.service';
import { MapsManagerService } from 'angular-cesium';
import { ResourceType } from '../../../lib/utility/constants.service';
import { RenderStatusService } from '../../service/cesium-map/renderstatus/render-status.service';

// NB: Cannot use "import { XXX, YYY, ZZZ } from 'cesium';" - it prevents initialising ContextLimits.js properly
// which causes a 'DeveloperError' when trying to draw the KML 
declare var Cesium;

/**
 * Use Cesium to add layer to map. This service class adds IRIS layer to the map
 */
@Injectable()
export class CsIrisService {

  constructor(private layerHandlerService: LayerHandlerService,
              private http: HttpClient,
              private renderStatusService: RenderStatusService,
              private mapsManagerService: MapsManagerService,
              @Inject('env') private env) {
  }

  /**
   * Retrieves KML features from the IRIS service via proxy/conversion service
   * 
   * @param layer the IRIS layer for the getfeature request to be made
   * @param onlineresource the IRIS online resource
   * @return Observable the observable from the http request
   */
  public getKMLFeature(layer: LayerModel, onlineResource: OnlineResourceModel): Observable<any> {

    const irisResources = this.layerHandlerService.getOnlineResources(layer, ResourceType.IRIS);
    const irisResource = irisResources[0];

    // Assemble parameters for proxy/conversion service
    let httpParams = new HttpParams();
    httpParams = httpParams.append('serviceUrl', irisResource.url);
    httpParams = httpParams.append('networkCode', irisResource.name);


    if (layer.proxyUrl) {
      // Send request to proxy/conversion service
      return this.http.get(this.env.portalBaseUrl + layer.proxyUrl, {
        params: httpParams
      }).pipe(map(response => {
        if (response['success'] === true) {
          return response['msg'];
        } else {
          return observableThrowError(response['Error retriving IRIS data']);
        }
      }), catchError(
        (error: HttpResponse<any>) => {
          return observableThrowError(error);
        }
      ), );
    };
  }

  /**
   * Private function to style the KML using Cesium's API
   * @param entity 
   */
  private styleIrisEntity(entity) {
    if (entity.name) {
      // Style label for each point
      entity.label = new Cesium.LabelGraphics({
        text: entity.name,
        showBackground: false,
        fillColor: Cesium.Color.BLACK,
        font: '12px roboto,sans-serif',
        style: Cesium.LabelStyle.FILL,
        pixelOffset: new Cesium.Cartesian2(9, -2),
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
			  distanceDisplayCondition: new Cesium.DistanceDisplayCondition(1.0, 8000000.0),
			  disableDepthTestDistance: Number.POSITIVE_INFINITY
      });
      // Style point in purple
      entity.point = new Cesium.PointGraphics({
        color: Cesium.Color.PURPLE,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        pixelSize: 8,
	      disableDepthTestDistance: Number.POSITIVE_INFINITY,
			  distanceDisplayCondition: new Cesium.DistanceDisplayCondition(1.0, 8000000.0)
      });
      // Don't display a billboard
      entity.billboard = null;
    }
  }

  /**
   * Add the IRIS KML layer
   * @param layer the IRIS layer to add to the map
   * @param param parameters for the IRIS layer
   */
  public addLayer(layer: LayerModel, param?: any): void {
    const irisOnlineResources = this.layerHandlerService.getOnlineResources(layer, ResourceType.IRIS);
    const me = this;

    for (const onlineResource of irisOnlineResources) {

      // Tell UI that we're about to add a resource to map
      this.renderStatusService.addResource(layer, onlineResource);

      // Get KML from the proxy/conversion service
      this.getKMLFeature(layer, onlineResource).subscribe(response => {
        const parser = new DOMParser();
        const dom = parser.parseFromString(response, "application/xml");

        // Get CesiumJS viewer
        const viewer = me.getViewer();
        const options = {
          camera: viewer.scene.camera,
          canvas: viewer.scene.canvas
        };
        const stylefn = me.styleIrisEntity;
        // Create data source 
        var source = new Cesium.KmlDataSource(options);

        // Load KML
        source.load(dom).then(function(dataSource) {
          for (const entity of dataSource.entities.values) {
            // Style each KML point
            stylefn(entity);
          }
          // Add all the KML points to map
          const dataSrc = viewer.dataSources.add(dataSource).then(dataSrc => {
            layer.csLayers.push(dataSrc);
          });
        });

        // Tell UI that we have completed updating the map
        me.renderStatusService.updateComplete(layer, onlineResource);
      },
        err => {
          me.renderStatusService.updateComplete(layer, onlineResource, true);
        });
    }
  }

  /**
   * Removes IRIS KML layer from the map
   * @method rmLayer
   * @param layer the IRIS layer to remove from the map.
   */
  public rmLayer(layer: LayerModel): void {
    const viewer = this.getViewer();
    for (const dataSrc of layer.csLayers) {
      viewer.dataSources.remove(dataSrc);
    }
    layer.csLayers = [];
    this.renderStatusService.resetLayer(layer.id)
  }

  /** 
   * Fetches Cesium 'Viewer'
  */
  private getViewer() {
    return this.mapsManagerService.getMap().getCesiumViewer();
  }

}
