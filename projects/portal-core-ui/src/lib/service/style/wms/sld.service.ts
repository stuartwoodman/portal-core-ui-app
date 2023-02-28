import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { OnlineResourceModel } from '../../../model/data/onlineresource.model';
import { UtilitiesService } from '../../../utility/utilities.service';
import { GSML41StyleService } from './gsml41-style.service';
import { MinTenemStyleService } from './min-tenem-style.service';


@Injectable()
export class SldService {

  constructor(private http: HttpClient, @Inject('env') private env) {}

  /**
   * Get the SLD from the URL
   * @param sldUrl the url containing the SLD
   * @param usePost use a HTTP POST request
   * @param onlineResource details of resource
   * @return an Observable of the HTTP request
   */
  public getSldBody(
    sldUrl: string,
    usePost: boolean,
    onlineResource: OnlineResourceModel,
    param?: any
  ): Observable<any> {
    // Pass through any sld_bodys already set
    if (param && param.sld_body && param.sld_body !== '') {
      return new Observable(observer => {
        observer.next(param.sld_body);
        observer.complete();
      });
    }
    // For ArcGIS mineral tenements layer we can get SLD_BODY parameter locally
    if (UtilitiesService.isArcGIS(onlineResource) && onlineResource.name === 'MineralTenement') {
      return new Observable(observer => {
        param.styles = 'mineralTenementStyle';
        const sldBody = MinTenemStyleService.getSld(onlineResource.name, param.styles, param.ccProperty);
        observer.next(sldBody);
        observer.complete();
      });
    }

    // For GeoSciML 4.1 we can get SLD_BODY parameter locally
    if (onlineResource.name === 'gsmlbh:Borehole') {
      return new Observable(observer => {
        param.styles = onlineResource.name;
        // If borehole name was set in filter
        let nameFilter = '';
        if ('optionalFilters' in param && param.optionalFilters.length > 0) {
          for (const filt of param.optionalFilters) {
            if (filt.label === 'Name') {
              nameFilter = filt.value;
              break;
            }
          }
        }
        const sldBody = GSML41StyleService.getSld(onlineResource.name, param.styles, nameFilter);
        observer.next(sldBody);
        observer.complete();
      });
  }
    // If there is no SLD URL coming from config
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
    if (!usePost) {
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
      return this.http.post(this.env.portalBaseUrl + sldUrl, httpParams.toString(), {
          headers: new HttpHeaders().set(
            'Content-Type',
            'application/x-www-form-urlencoded'
          ),
          responseType: 'text'
        }).pipe(
          map(response => {
            return response;
          }),
          catchError((error: HttpResponse<any>) => {
            return throwError(error);
          })
        );
    }
  }

}
