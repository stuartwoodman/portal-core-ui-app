import { Injectable, Inject } from '@angular/core';

/**
 * This service class contains functions used for manipulating KML documents
 */
@Injectable({
  providedIn: 'root'
})
export class KMLDocService {

  constructor(@Inject('env') private env) { }

  /**
   * Clean KML text by removing illegal chars and 
   * forcing proxying of icon images to avoid CORS errors
   * 
   * @param kmlTxt KML text to be cleaned
   * @returns clean KML string
   */
  public cleanKML(kmlTxt: string): string {
    // Removes non-standard chars that can cause errors
    kmlTxt = kmlTxt.replace(/\016/g, '');
    kmlTxt = kmlTxt.replace(/\002/g, '');
    // Inserts local paddle image to avoid CORS errors
    // Cesium does not load proxied images for some as yet unknown reason
    kmlTxt = kmlTxt.replace(/<Icon>\s*<href>.*<\/href>/g, 
             '<Icon>\n<href>extension/images/white-paddle.png</href>');
    return kmlTxt;
  }
}
