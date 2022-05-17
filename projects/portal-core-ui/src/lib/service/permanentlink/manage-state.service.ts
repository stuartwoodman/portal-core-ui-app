import { CsMapObject } from '../cesium-map/cs-map-object';
import {Injectable, Inject} from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { throwError as observableThrowError, of } from 'rxjs';
import {map, catchError } from 'rxjs/operators';

import { Observable } from 'rxjs';


/**
 * A service class to assist maintaining the current state of the portal including
 * keeping track of the layers and its filter that have been added to the map
 * This also includes getting the current state of the map
 */
@Injectable()
export class ManageStateService {

  private state: any = {};

  constructor(private csMapObject: CsMapObject, private http: HttpClient, @Inject('env') private env) {
  }

  /**
   * Update the state whenever a layer is added to the map
   * @param layerid the layer that have been added
   * @param filterCollection the associated filtercollection of the layer
   * @param optionalFilters any optional filters that have been selected
   */
  public addLayer(layerid: string, filterCollection: any, optionalFilters: any) {
    if (!filterCollection) {
      this.state[layerid] = { filterCollection: {}, optionalFilters: [] };
      return;
    }
    this.state[layerid] = {
      filterCollection: filterCollection,
      optionalFilters: optionalFilters
    };
  }

  /**
   * Generate a one off state. This is used in NVCL borehole analytic where we want to generate a perm link to a artifically generated layer and filter
   * @param layerid the layer that have been added
   * @param filterCollection the associated filtercollection of the layer
   * @param optionalFilters any optional filters that have been selected
   */
  public generateOneOffState(layerid: string, filterCollection: any, optionalFilters: any) {
    filterCollection['optionalFilters'] = [];
    const state = {};
    state[layerid] = {
      filterCollection: filterCollection,
      optionalFilters: optionalFilters
    };
    return state;
  }

  /**
   * When a layer is removed, update the state
   * @param layerid the id of the layer that have been removed
   */
  public removeLayer(layerid: string) {
    delete this.state[layerid];
  }

  /**
   * Return the current state
   * @return return the state in the format layerid:{filterCollection,optionalFilters,map{zoom, center}}
   */
  public getState(): any {
    this.state.map = this.csMapObject.getCurrentMapState();
    return this.state;
  }

  /**
   * Resume the state of the map given the map state
   * @param mapState map state object
   */
  public resumeMapState(mapState) {
    if (mapState) {
      this.csMapObject.resumeMapState(mapState);
    }
  }

  /**
   * Saves current UI state via back end API call
   * 
   * @param state UI state, a JSON string
   * @returns Observable of response
   */
  public saveStateToDB(state: string): Observable<any> {
    const id = uuidv4();
    let httpParams = new HttpParams();
    httpParams = httpParams.append('id', id);
    httpParams = httpParams.append('state', state);
    return this.http.get(this.env.portalBaseUrl + 'saveUIState.do', {
      params: httpParams
    }).pipe(map(response => {
      if (response['success']) {
        response['id'] = id;
      }
      return response;
    }), catchError(
      (error: HttpResponse<any>) => {
        return observableThrowError(error);
      }
    ), );
  }

  /**
   * Retrieves current UI state via back end API call
   * 
   * @param id identity string of UI state
   * @returns JSON response or empty object
   */
  public fetchStateFromDB(id: string): Observable<any> {
    // If no state then return empty object
    if (id === undefined) {
      return of({});
    }
    let httpParams = new HttpParams();
    httpParams = httpParams.append('id', id);
    return this.http.get(this.env.portalBaseUrl + 'fetchUIState.do', {
      params: httpParams
    }).pipe(map(response => {
      if (response['success'] === true) {
        return JSON.parse(response['data']);
      }
      // If not successful, return empty object
      return of({});
    }), catchError(
      (error: HttpResponse<any>) => {
        return observableThrowError(error);
      }
    ), );
  }

}
