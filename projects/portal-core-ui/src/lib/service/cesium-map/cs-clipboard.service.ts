import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import * as olProj from 'ol/proj';
import { CsMapObject } from './cs-map-object';
import { GeometryType } from '../../utility/constants.service';
import { isNumber } from '@turf/helpers';

/**
 * A wrapper around the clipboard object for use in the portal.
 */
@Injectable()
export class CsClipboardService {
  private polygonBBox: Polygon;
  public polygonsBS: BehaviorSubject<Polygon>;

  private bShowClipboard: boolean = false;
  public clipboardBS = new BehaviorSubject<boolean>(this.bShowClipboard);

  private bFilterLayers: boolean = false;
  public filterLayersBS = new BehaviorSubject<boolean>(this.bFilterLayers);

  public isDrawingPolygonBS: BehaviorSubject<boolean>;

  constructor(private csMapObject: CsMapObject) {
    this.polygonBBox = null;
    this.polygonsBS = new BehaviorSubject<Polygon>(this.polygonBBox);
    this.polygonsBS.next(this.polygonBBox);
    this.isDrawingPolygonBS = this.csMapObject.isDrawingPolygonBS;
  }

  public toggleClipboard(open?: boolean) {
    if (open !== undefined) {
      this.bShowClipboard = open;
    } else {
      this.bShowClipboard = !this.bShowClipboard;
    }

    this.clipboardBS.next(this.bShowClipboard);
    // if no clipboard, recover the all layers list.
    if (!this.bShowClipboard) {
      this.bFilterLayers = false ;
      this.filterLayersBS.next(this.bFilterLayers );
    }
  }

  /**
   * Toggle the polygon filter layers. Can be set using optional parameter.
   * 
   * @param layersOn (optional) if supplied, set the filter layers to this value
   */
  public toggleFilterLayers(layersOn?: boolean) {
    if (layersOn) {
      this.bFilterLayers = layersOn;
    } else {
      this.bFilterLayers = !this.bFilterLayers;
    }
    this.filterLayersBS.next(this.bFilterLayers);
  }
  /**
   * Method for extract a polygon coords string from geometry.
   * @param geometry string
   * @returns the string of a polygon string.
   */
  public getCoordinates(geometry: string): string {
    const tag = '<gml:coordinates xmlns:gml=\"http://www.opengis.net/gml\" decimal=\".\" cs=\",\" ts=\" \">';
    var coordsString = geometry.substring(
      geometry.indexOf(tag) + tag.length, 
      geometry.lastIndexOf("</gml:coordinates>")
    );
    return coordsString;
  }
  /**
   * Method for construct a polygon geometry.
   * @param coords string
   * @returns the string of a polygon geometry.
   */
  public getGeometry(coords: string): any {
    return '<gml:MultiPolygon srsName=\"urn:ogc:def:crs:EPSG::4326\">' +
            '<gml:polygonMember>' +
              '<gml:Polygon srsName=\"EPSG:4326\">' +
                '<gml:outerBoundaryIs>' +
                  '<gml:LinearRing>' +
                    '<gml:coordinates xmlns:gml=\"http://www.opengis.net/gml\" decimal=\".\" cs=\",\" ts=\" \">' +
                      coords +
                    '</gml:coordinates>' +
                  '</gml:LinearRing>' +
                '</gml:outerBoundaryIs>' +
              '</gml:Polygon>' +
            '</gml:polygonMember>' +
          '</gml:MultiPolygon>';
  }
  /**
   * Method for rendering a polygon on cesium map.
   * @param coordsArray array of coords
   * @returns void.
   */  
  public renderPolygon(coordsArray:Number[]) {
    this.csMapObject.renderPolygon(coordsArray);
  }
  /**
   * Method for drawing a polygon on the map.
   * @returns the polygon coordinates string BS on which the polygon is drawn on.
   */
  public drawPolygon() {
    this.csMapObject.drawPolygon().subscribe((coords) => {
      const newPolygon = {
        name: 'Polygon created',
        srs: 'EPSG:4326',
        geometryType: GeometryType.POLYGON,
        coordinates: this.getGeometry(coords)
      };
      this.polygonBBox = newPolygon;
      this.polygonsBS.next(this.polygonBBox);
    });
  }

  /**
   * Draw a polygon on map using a KML File
   *
   * @param file File object, contains KML polygon, assumes EPSG:4326
   */ 
  public loadPolygonFromKML(file:File) {
    if (file) {
      var reader = new FileReader();
      reader.onload = () => {
          const kml = reader.result.toString();
          var coordsString = kml.substring(
            kml.indexOf("<coordinates>") + "<coordinates>".length, 
            kml.lastIndexOf("</coordinates>")
          );
          const coordsEPSG4326LngLat = coordsString.trim().replace(/\r?\n|\r/g,' ');
          const coordsList = coordsEPSG4326LngLat.split(' ');        
          let coordsListLngLat = [];
          let coordsListLatLng = [];
          for (let i = 0; i<coordsList.length; i++) {
            const coord = coordsList[i].split(',')
            const lng = parseFloat(coord[0]).toFixed(2);
            const lat = parseFloat(coord[1]).toFixed(2)
            if (isNumber(lng) && isNumber(lat)) {
              coordsListLngLat.push(lng);
              coordsListLngLat.push(lat);
              coordsListLatLng.push(lat.toString() + ',' + lng.toString())
            }
          } 
          this.renderPolygon(coordsListLngLat); //need to be [lng lat lng lat]
          const coordsEPSG4326LatLng = coordsListLatLng.join(' ');
          const newPolygon = {
            name: file.name,
            srs: 'EPSG:4326',
            geometryType: GeometryType.POLYGON,
            coordinates: this.getGeometry(coordsEPSG4326LatLng) //need to be 'lat,lng lat,lng...'
          };  
          this.polygonBBox = newPolygon;
          this.polygonsBS.next(this.polygonBBox);
      };
      reader.readAsText(file);
    }

  }
  /**
   * Add a polygon to the clipboard, usually from a layer
   * @param newPolygon polygon object
   */
  public addPolygon(newPolygon: Polygon) {
    if (this.polygonBBox !== null && this.polygonBBox.name === newPolygon.name) {
      return;
    }
    //LJ08
    if (newPolygon.srs !== 'EPSG:3857') {
      console.log("ERROR:addPolygon's layer are not EPSG3857");
      return;
    }
    const coordString = this.getCoordinates( newPolygon.coordinates);
    const coordsArray = coordString.split(' ');
    const coords4326ListLngLat = []; //for rendering
    const coords4326ListLatLng = []; //for polygon wms query
    for (let i = 0; i < coordsArray.length; i ++) {
      const lonLat = coordsArray[i].split(',');
      // transform from 'EPSG:3857' to 'EPSG:4326' format 
      const point4326 = olProj.transform([lonLat[0], lonLat[1]], newPolygon.srs , 'EPSG:4326');
      const lng = parseFloat(point4326[0]).toFixed(2);
      const lat = parseFloat(point4326[1]).toFixed(2)
      if (isNumber(lng) && isNumber(lat)) { //some coord is Null
        coords4326ListLngLat.push(lng);
        coords4326ListLngLat.push(lat);
        coords4326ListLatLng.push(lat.toString() + ',' + lng.toString());
      }
    }
    // make newPolygon
    newPolygon.srs = 'EPSG:4326';
    newPolygon.geometryType = GeometryType.POLYGON;
    const coordsEPSG4326LatLng = coords4326ListLatLng.join(' ');
    newPolygon.coordinates = this.getGeometry(coordsEPSG4326LatLng) //need to be 'lat,lng lat,lng...';
    // save the newPolygon to polygonsBS
    this.polygonBBox = newPolygon;
    this.polygonsBS.next(this.polygonBBox);
    // show polygon on map
    this.renderPolygon(coords4326ListLngLat);
  }

  public removePolygon() {
    this.polygonsBS.next(this.polygonBBox);
  }

  public clearClipboard() {
    this.csMapObject.clearPolygon();
    this.polygonBBox = null;
    this.polygonsBS.next(this.polygonBBox);
  }
}

export interface Polygon {
  name: string;
  srs: string;
  geometryType: GeometryType;
  coordinates: string;
  raw?: string;
}
