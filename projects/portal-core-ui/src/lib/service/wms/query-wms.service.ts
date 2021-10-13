
import {throwError as observableThrowError, Observable} from 'rxjs';

import {catchError, map} from 'rxjs/operators';
import {Injectable, Inject} from '@angular/core';
import {HttpClient, HttpParams, HttpHeaders, HttpResponse} from '@angular/common/http';
import {OnlineResourceModel} from '../../model/data/onlineresource.model';
import {CsMapObject} from '../cesium-map/cs-map-object';
import {UtilitiesService} from '../../utility/utilities.service';


@Injectable()
export class QueryWMSService {

  constructor(private http: HttpClient, private csMapObject: CsMapObject, @Inject('env') private env) {
  }

  public getFilter(lon: number, lat: number, layerId: string, extraFilter: string): string {
    const distPerPixel = this.csMapObject.getDistPerPixel();
    const step = distPerPixel * 20; // 10pixel distance by degree = 10*1.1km.
    let geom = 'gsmlp:shape';
    switch (layerId) {
      case 'remanent-anomalies':
      case 'remanent-anomalies-EMAG':
        geom = 'CentreLocation';
        break;
      case 'nvcl-v2-borehole':
        geom = 'gsmlp:shape';
        break;
    }

    const ogcFilter = '<ogc:Filter xmlns:ogc=\"http://www.opengis.net/ogc\" xmlns:gsmlp=\"http://xmlns.geosciml.org/geosciml-portrayal/4.0\" xmlns:gml=\"http://www.opengis.net/gml\">' +
    '<ogc:And><ogc:BBOX><ogc:PropertyName>' + geom + '</ogc:PropertyName><gml:Box srsName=\"urn:x-ogc:def:crs:EPSG:4326\">' + 
    '<gml:coord><gml:X>' + (lon - step) + '</gml:X><gml:Y>' + (lat - step) + '</gml:Y></gml:coord>' + 
    '<gml:coord><gml:X>' + (lon + step) + '</gml:X><gml:Y>' + (lat + step) + '</gml:Y></gml:coord>' + 
    '</gml:Box></ogc:BBOX>' + extraFilter + '</ogc:And></ogc:Filter>';
    return ogcFilter;
  }

  /**
  * A get feature info request via proxy
  * @param onlineresource the WMS online resource
  * @param lon [lat,long] map coordinates of clicked on point  
  * @param lat [lat,long] map coordinates of clicked on point  
  * @param extraFilter 
  * @param layerId layerId
  * @return Observable the observable from the http request
   */

  public wfsGetFeature(onlineResource: OnlineResourceModel, lon: number, lat: number,
                       extraFilter: string, layerId: string): Observable<any> {
    let formdata = new HttpParams();
    const serviceUrl = UtilitiesService.rmParamURL(onlineResource.url);
    const typeName = onlineResource.name;
    formdata = formdata.append('SERVICE', 'WFS');
    formdata = formdata.append('request', 'GetFeature');
    formdata = formdata.append('typeName', typeName);
    formdata = formdata.append('outputFormat', 'GML3');
    const version = '1.1.0';
    // if ( version === '2.0.0' ) {
    //   formdata = formdata.append('count', '10');
    // } else
    {
      formdata = formdata.append('maxFeatures', '10');
    }
    formdata = formdata.append('version', version);
    formdata = formdata.append('FILTER', this.getFilter(lon, lat, layerId, extraFilter));
    return this.http.get(serviceUrl, {
      params: formdata,
      responseType: 'text'
    }).pipe(map(response => {
      return response;
    }), catchError(
    (error: HttpResponse<any>) => {
          return observableThrowError(error);
        }
      ), );

  }
  /**
  * A get feature info request via proxy
  * @param onlineresource the WMS online resource
  * @param sldBody style layer descriptor
  * @param x  pixel coordinates of clicked on point
  * @param y  pixel coordinates of clicked on point* 
  * @param lon [lat,long] map coordinates of clicked on point  
  * @param lat [lat,long] map coordinates of clicked on point  
  * @param width tile width
  * @param height tile height
  * @param bbox tile bbox
  * @return Observable the observable from the http request
   */

  public getFeatureInfo(onlineResource: OnlineResourceModel, sldBody: string, lon: number, lat: number,
                        x: number, y: number, width: number, height: number, bbox: number[]): Observable<any> {
    let formdata = new HttpParams();
    formdata = formdata.append('serviceUrl', UtilitiesService.rmParamURL(onlineResource.url));
    formdata = formdata.append('lng', lon.toString());
    formdata = formdata.append('lat', lat.toString());
    formdata = formdata.append('QUERY_LAYERS', onlineResource.name);
    formdata = formdata.append('feature_count', '10');
    formdata = formdata.append('x', x.toString());
    formdata = formdata.append('y', y.toString());
    formdata = formdata.append('WIDTH', width.toString());
    formdata = formdata.append('HEIGHT', height.toString());
    formdata = formdata.append('BBOX', bbox.join(','));

    formdata = formdata.append('version', onlineResource.version);

    if (sldBody) {
      formdata = formdata.append('SLD_BODY', sldBody);
      formdata = formdata.append('postMethod', 'true');
    } else {
      formdata = formdata.append('SLD_BODY', '');
    }

    if (onlineResource.name.indexOf('ProvinceFullExtent') >= 0) {
      formdata = formdata.append('INFO_FORMAT', 'application/vnd.ogc.gml');
    } else {
      formdata = formdata.append('INFO_FORMAT', 'application/vnd.ogc.gml/3.1.1');
    }

    if (UtilitiesService.isArcGIS(onlineResource)) {
      formdata = formdata.set('INFO_FORMAT', 'text/xml');
      formdata = formdata.set('SLD_BODY', '');
      formdata = formdata.set('postMethod', 'false');
    }

    // GSKY services always return JSON responses
    if (UtilitiesService.isGSKY(onlineResource)) {
      formdata = formdata.set('INFO_FORMAT', 'application/json');
    }

    if (onlineResource.description.indexOf('EMAG2 - Total Magnetic Intensity') >= 0) {
      formdata = formdata.set('INFO_FORMAT', 'text/xml');
    }

    if (onlineResource.description.indexOf('Onshore Seismic Surveys') >= 0) {
      formdata = formdata.set('INFO_FORMAT', 'text/xml');
    }

    return this.http.post(this.env.portalBaseUrl + 'wmsMarkerPopup.do', formdata.toString(), {
      headers: new HttpHeaders()
        .set('Content-Type', 'application/x-www-form-urlencoded'),
      responseType: 'text'
    }).pipe(map(response => {
      return response;
    }), catchError(
    (error: HttpResponse<any>) => {
          return observableThrowError(error);
        }
      ), );


  }

}
