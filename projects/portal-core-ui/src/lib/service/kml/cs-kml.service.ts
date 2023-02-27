
import { throwError as observableThrowError, Observable } from 'rxjs';
import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';

import { OnlineResourceModel } from '../../model/data/onlineresource.model';
import { LayerModel } from '../../model/data/layer.model';
import { LayerHandlerService } from '../cswrecords/layer-handler.service';
import { MapsManagerService } from '@auscope/angular-cesium';
import { ResourceType } from '../../utility/constants.service';
import { RenderStatusService } from '../cesium-map/renderstatus/render-status.service';

// NB: Cannot use "import { XXX, YYY, ZZZ, Color } from 'cesium';" - it prevents initialising ContextLimits.js properly
// which causes a 'DeveloperError' when trying to draw the KML 
declare var Cesium;

/**
 * Use Cesium to add layer to map. This service class adds KML layer to the map
 */
@Injectable()
export class CsKMLService {

  constructor(private layerHandlerService: LayerHandlerService,
    private http: HttpClient,
    private renderStatusService: RenderStatusService,
    private mapsManagerService: MapsManagerService,
    @Inject('env') private env) {
  }

  /**
   * Downloads KML, cleans it by removing illegal chars and 
   * forcing proxying of icon images to avoid CORS errors
   * 
   * @param kmlResource KML resource to be fetched
   * @returns cleaned KML text
   */
  private getKMLFeature(kmlResource: OnlineResourceModel): Observable<any> {
    return this.http.get(kmlResource.url, { responseType: 'text'}).pipe(map((kmlTxt: string) => {
      // Removes non-standard chars that can cause errors
      kmlTxt = kmlTxt.replace(/\016/g, '');
      kmlTxt = kmlTxt.replace(/\002/g, '');
      // Inserts our proxy to avoid CORS errors
      kmlTxt = kmlTxt.replace(/<href>(.*)<\/href>/g, '<href>' + this.env.portalBaseUrl + 'getViaProxy.do?url=$1</href>');
      return kmlTxt;
    }), catchError(
      (error: HttpResponse<any>) => {
        return observableThrowError(error);
      }
    ));
  }


  /**
   * Add the KML layer
   * @param layer the KML layer to add to the map
   * @param param parameters for the KML layer
   */
  public addLayer(layer: LayerModel, param?: any): void {
    const kmlOnlineResources: OnlineResourceModel[] = this.layerHandlerService.getOnlineResources(layer, ResourceType.KML);
    const me = this;

    // Get CesiumJS viewer
    const viewer = this.getViewer();
    const options = {
      camera: viewer.scene.camera,
      canvas: viewer.scene.canvas,
    };

    for (const onlineResource of kmlOnlineResources) {

      // Tell UI that we're about to add a resource to map
      this.renderStatusService.addResource(layer, onlineResource);

      // Create data source
      let source = new Cesium.KmlDataSource(options);
      // Add an event to tell us when loading is finished
      source.loadingEvent.addEventListener(function(evt, isLoading: boolean) {
        if (!isLoading) {
          // Tell UI that we have completed updating the map
          me.renderStatusService.updateComplete(layer, onlineResource);
        }
      });
      // Add KML to map
      this.getKMLFeature(onlineResource).subscribe((response) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(response, "text/xml");
        source.load(doc).then(function (dataSource) {
          viewer.dataSources.add(dataSource).then(dataSrc => {
            layer.csLayers.push(dataSrc);
          })
        })
      }, (err) => {
        alert("Unable to load KML: " + err.message);
        console.error("Unable to load KML: ", err);
        // Tell UI that we have completed updating the map & there was an error
        this.renderStatusService.updateComplete(layer, onlineResource, true);
      });
    }
  }

  /**
   * Removes KML layer from the map
   * @method rmLayer
   * @param layer the KML layer to remove from the map.
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
