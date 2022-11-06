import { Injectable, Inject} from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { throwError as observableThrowError, of, BehaviorSubject } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Observable } from 'rxjs';

import { CsMapObject } from '../cesium-map/cs-map-object';
import { MapState } from '../../model/data/mapstate.model';

/**
 * A service class to assist maintaining the current state of the portal including
 * keeping track of the layers and its filter that have been added to the map
 * This also includes getting the current state of the map
 */
@Injectable(
  { providedIn: 'root' } // singleton service
)
export class ManageStateService {

  private state: any = {};
  private prevState: any = {};
  private permLinkMode: boolean = false; // Is true if a permanent link has been employed

  // Layer requires expanding
  private layerToExpandBS: BehaviorSubject<string> = new BehaviorSubject<string>(null);
  public readonly layerToExpand = this.layerToExpandBS.asObservable();

  constructor(private csMapObject: CsMapObject, private http: HttpClient, @Inject('env') private env) {
  }

  /**
   * Is the map currently displaying a permanent link?
   *
   * @returns permanent link mode
   */
  public isPermLinkMode() {
    return this.permLinkMode;
  }

  /**
   * Set the permanent link mode
   *
   * @param mode permanent link mode
   */
  public setPermLinkMode(mode: boolean) {
    this.permLinkMode = mode;
  }

  /**
   * Update the state whenever a layer is added to the map
   * @param layerid the layer that have been added
   * @param filterCollection the associated filtercollection of the layer
   * @param optionalFilters any optional filters that have been selected
   */
  public addLayer(layerid: string, currentTime: Date, filterCollection: any, optionalFilters: any, advancedFilter: any) {
    if (!filterCollection && !advancedFilter) {
      this.state[layerid] = { filterCollection: {}, optionalFilters: [] };
      return;
    }
    this.state[layerid] = {
      filterCollection: filterCollection,
      optionalFilters: optionalFilters,
      advancedFilter: advancedFilter
    };
    if (currentTime) {
      this.state[layerid].time = currentTime;
    }
    this.permLinkMode = false;
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
    this.permLinkMode = false;
  }

  /**
   * Return the current state
   * @return return the state as a MapState object
   */
  public getState(): MapState {
    this.state.map = this.csMapObject.getCurrentMapState();
    return this.state;
  }

  /**
   * Resume the state of the map given the map state
   * Used to employ permanent link state
   * @param mapState map state object
   */
  public resumeMapState(mapState: MapState) {
    this.permLinkMode = true;
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
    // If we have already stored this state locally then return it
    if (id in this.prevState) {
      return of(this.prevState[id]);
    }
    // Call the backend API to get state
    let httpParams = new HttpParams();
    httpParams = httpParams.append('id', id);
    return this.http.get(this.env.portalBaseUrl + 'fetchUIState.do', {
      params: httpParams
    }).pipe(map(response => {
      if (response['success'] === true) {
        this.prevState[id] = JSON.parse(response['data']);
        return this.prevState[id];
      }
      // If not successful, return empty object
      return {};
    }), catchError(
      (error: HttpResponse<any>) => {
        return observableThrowError(error);
      }
    ), );
  }

  /**
   * Notify listeners (LayerPanel) that a layer is to be expanded
   *
   * @param layerId ID of layer
   */
  setLayerToExpand(layerId: string) {
    this.layerToExpandBS.next(layerId);
  }

}
