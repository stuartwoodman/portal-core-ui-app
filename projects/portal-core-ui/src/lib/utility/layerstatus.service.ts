import { throwError as observableThrowError, Observable, interval } from 'rxjs';
import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { OnlineResourceModel } from 'portal-core-ui/model/data/onlineresource.model';

/**
 * This service periodically queries getKnownLayers in the back end, which will get latest statuses from
 * Google StackDriver.
 */
@Injectable()
export class LayerStatusService {
  // synchronised layer id to failing hosts from getKnownLayers in the backend queried from stackdriver
  private layerStatusMap;
  constructor(
    private http: HttpClient,
    @Inject('env') private env
  ) {
    this.layerStatusMap = new Map();
    this.updateLayerStatus();
  }

  /**
   * Regularly update layer status from stackdriver service by calling getKnownLayers.
   */
  private updateLayerStatus() {
    interval(15 * 1000).subscribe(() => { // will execute every 15 minutes
      return this.http.get(this.env.portalBaseUrl + this.env.getCSWRecordUrl)
        .subscribe((response) => {
          const layerList = response['data'];
          layerList.forEach(function (item, i) {
            this.layerStatusMap.put(item.id, item.stackdriverFailingHosts);
          });           
       });
    });
  }
  /**
   * Query the status cache against stackdriver if any related services is down.
   * @param layer id
   * @return true if one of the services is down
   */
  public isLayerDown(layerId: string): boolean {
    var failingHosts = this.layerStatusMap.get(layerId);
    if (failingHosts && failingHosts.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * check if the cswRecord has a entry in the list of failing nagios record
   * @param layerId Layer id from CSW record
   * @param cswRecord the csw we are matching for problem
   */
  public isEndpointFailing(layerId: string, onlineResource: OnlineResourceModel): boolean {
    var stackdriverFailingHosts = this.layerStatusMap.get(layerId);    
    if (stackdriverFailingHosts && stackdriverFailingHosts.length > 0) {
      for (const stackdriverFailingHost of stackdriverFailingHosts) {
        if (onlineResource.url.indexOf(stackdriverFailingHost) > -1) {
          return true;
        }
      }
    }
    return false;
  }
}