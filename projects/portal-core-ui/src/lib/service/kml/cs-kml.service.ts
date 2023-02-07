import { OnlineResourceModel } from '../../model/data/onlineresource.model';
import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
   * Add the KML layer
   * @param layer the KML layer to add to the map
   * @param param parameters for the KML layer
   */
  public addLayer(layer: LayerModel, param?: any): void {
    const kmlOnlineResources: OnlineResourceModel[] = this.layerHandlerService.getOnlineResources(layer, ResourceType.KML);

    for (const onlineResource of kmlOnlineResources) {

      // Tell UI that we're about to add a resource to map
      this.renderStatusService.addResource(layer, onlineResource);

      // Get CesiumJS viewer
      const viewer = this.getViewer();
      const options = {
        camera: viewer.scene.camera,
        canvas: viewer.scene.canvas
      };
      
      // Create data source
      let source = new Cesium.KmlDataSource(options);

      // Add all the KML points to map
      viewer.dataSources.add(source.load(onlineResource.url)).then(dataSrc => {
        layer.csLayers.push(dataSrc);
      });

      // Tell UI that we have completed updating the map
      this.renderStatusService.updateComplete(layer, onlineResource);
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
