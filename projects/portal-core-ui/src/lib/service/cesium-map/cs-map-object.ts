import { RenderStatusService } from './renderstatus/render-status.service';
import { UtilitiesService } from '../../utility/utilities.service';
import { Injectable } from '@angular/core';
import { BehaviorSubject} from 'rxjs';
import { EditActions, MapsManagerService, PolygonEditorObservable, PolygonEditUpdate, PolygonsEditorService, RectangleEditorObservable,
         RectanglesEditorService } from 'angular-cesium';
import { Cartesian3, Color, ColorMaterialProperty, Ellipsoid, WebMercatorProjection } from 'cesium';
import { LayerModel } from '../../model/data/layer.model';

declare var Cesium;

/**
 * A wrapper around the openlayer object for use in the portal.
 */
@Injectable()
export class CsMapObject {

  private groupLayer: {};
  private clickHandlerList: ((p: any) => void )[] = [];
  private ignoreMapClick = false;
  private polygonEditable$: PolygonEditorObservable;
  public isDrawingPolygonBS = new BehaviorSubject<boolean>(false);

  constructor(private renderStatusService: RenderStatusService, private rectangleEditor: RectanglesEditorService,
              private polygonsCesiumEditor: PolygonsEditorService, private mapsManagerService: MapsManagerService) {

    this.groupLayer = {};
  }

  public processClick(p: number[]) {
     if (this.ignoreMapClick) {
       return;
     }

     for (const clickHandler of this.clickHandlerList) {
       clickHandler(p);
     }
  }

  /**
   * Register a click handler callback function which is called when there is a click event
   * @param clickHandler callback function, input parameter is the pixel coords that were clicked on
   */
  public registerClickHandler( clickHandler: (p: number[]) => void) {
    this.clickHandlerList.push(clickHandler);
  }

  public getViewSize(): any {
    const viewer = this.mapsManagerService.getMap().getCesiumViewer();
    return [viewer.canvas.width, viewer.canvas.height];
  }

  /**
   * returns distance (EPSG4326 Degree) of one pixel in the current viewer
   * epsg4326 1.0 degree to 111km roughly
   */
  public getDistPerPixel(): any {
    const viewer = this.mapsManagerService.getMap().getCesiumViewer();
    const width = viewer.canvas.width;
    const height = viewer.canvas.height;
    const posWS = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(1, height), Cesium.Ellipsoid.WGS84);
    const posEN = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(width, 1 ), Cesium.Ellipsoid.WGS84);
    let distPerPixel = 0.01; // 1.11km
    if (posWS != null && posEN != null) {
      const cartographicWS = viewer.scene.globe.ellipsoid.cartesianToCartographic(posWS);
      const cartographicEN = viewer.scene.globe.ellipsoid.cartesianToCartographic(posEN);
      const latDiff = Math.abs(Cesium.Math.toDegrees(cartographicWS.latitude) - Cesium.Math.toDegrees(cartographicEN.latitude)) ;
      const lonDiff = Math.abs(Cesium.Math.toDegrees(cartographicWS.longitude) - Cesium.Math.toDegrees(cartographicEN.longitude)) ;
      const latPerPixel = latDiff / height;
      const lonPerPixel = lonDiff / width;
      distPerPixel = (latPerPixel > lonPerPixel) ? latPerPixel : lonPerPixel;
    }
    return distPerPixel;
  }

  public getMapViewBounds(): any {
    const viewer = this.mapsManagerService.getMap().getCesiumViewer();
    const width = viewer.canvas.width;
    const height = viewer.canvas.height;
    const posWS = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(1, height), Cesium.Ellipsoid.WGS84);
    const posEN = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(width, 1 ), Cesium.Ellipsoid.WGS84);

    if (posWS != null && posEN != null) {
      const cartographicWS = viewer.scene.globe.ellipsoid.cartesianToCartographic(posWS);
      const cartographicEN = viewer.scene.globe.ellipsoid.cartesianToCartographic(posEN);
      const wmp = new WebMercatorProjection();
      const p1 = wmp.project(cartographicWS);
      const p2 = wmp.project(cartographicEN);
      const bounds = [ p1.x, p1.y, p2.x, p2.y];
      return bounds;
    } else {
      return null;
    }
  }

  /**
   * Add an ol layer to the ol map. At the same time keep a reference map of the layers
   * @param layer: the ol layer to add to map
   * @param id the layer id is used
   */
  public addLayerById(layer: LayerModel, id: string): void {
    if (!this.groupLayer[id]) {
      this.groupLayer[id] = [];
    }
    // LJ:skip the polygon search for getFeatureInfo.
    if (layer.sldBody && layer.sldBody.indexOf('<ogc:Intersects>') >= 0)  {
      // RA: but retain the other filters
      const polygonFilter = UtilitiesService.getPolygonFilter(layer.sldBody);
      layer.sldBody = layer.sldBody.replace(polygonFilter, '');
    }
    this.groupLayer[id].push(layer);
  }

  /**
   * remove references to the layer by layer id.
   * @param id the layer id is used
   */
  public removeLayerById(id: string) {
      delete this.groupLayer[id];
      this.renderStatusService.resetLayer(id);
  }

  /**
   * Method for drawing a polygon shape on the map. e.g selecting a polygon bounding box on the map
   * @returns a observable object that triggers an event when the user complete the drawing
   */
  public drawPolygon(): BehaviorSubject<string> {
    this.ignoreMapClick = true;
    if (this.polygonEditable$) {
      this.clearPolygon();
    }
    this.isDrawingPolygonBS.next(true);

    // create accepts PolygonEditOptions object
    this.polygonEditable$ = this.polygonsCesiumEditor.create({
      pointProps: {
        color: Color.SKYBLUE .withAlpha(0.9),
        outlineColor: Color.BLACK.withAlpha(0.8),
        outlineWidth: 1,
        pixelSize: 13,
      },
      polygonProps: {
        material: new ColorMaterialProperty(Color.LIGHTSKYBLUE.withAlpha(0.05)),
        fill: true,
      },
      polylineProps: {
        material: () => new ColorMaterialProperty(Color.SKYBLUE.withAlpha(0.7)),
        width: 3,
      },
    });

    let coordString = '';
    const polygonStringBS = new BehaviorSubject<string>(coordString);
    this.polygonEditable$.subscribe((editUpdate: PolygonEditUpdate) => {
      if (editUpdate.editAction === EditActions.ADD_LAST_POINT) {
        const cartesian3 = this.polygonEditable$.getCurrentPoints()
          .map(p => p.getPosition());
        cartesian3.push(cartesian3[0]);
        const coords = cartesian3
            .map(cart => Ellipsoid.WGS84.cartesianToCartographic(cart as Cartesian3))
              .map(latLon => [latLon.latitude * 180 / Math.PI , latLon.longitude * 180 / Math.PI]);
        coordString = coords.join(' ');
        polygonStringBS.next(coordString);
        this.polygonEditable$.disable();
        this.isDrawingPolygonBS.next(false);
       }
    });
    return polygonStringBS;
  }

  clearPolygon() {
    this.isDrawingPolygonBS.next(false);
    if (this.polygonEditable$) {
      this.polygonEditable$.dispose();
      this.polygonEditable$ = undefined;
    }
  }

 /**
  * Method for drawing a box on the map. e.g selecting a bounding box on the map
  * @returns a observable object that triggers an event when the user complete the drawing
  */
  public drawBox(): RectangleEditorObservable {
    return this.rectangleEditor.create();
  }

}
