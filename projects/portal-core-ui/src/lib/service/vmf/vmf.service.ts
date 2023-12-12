import { Injectable, Inject } from '@angular/core';

/**
 * This service class contains functions used for manipulating VMF documents
 */
@Injectable({
  providedIn: 'root'
})
export class VMFDocService {

  constructor(@Inject('env') private env) { }

  /**
   * Clean VMF text by removing illegal chars and 
   * forcing proxying of icon images to avoid CORS errors
   * 
   * @param vmfTxt VMF text to be cleaned
   * @returns clean VMF string
   */
  public cleanVMF(vmfTxt: string): string {
    // Removes non-standard chars that can cause errors
    vmfTxt = vmfTxt.replace(/\016/g, '');
    vmfTxt = vmfTxt.replace(/\002/g, '');
    // Inserts local paddle image to avoid CORS errors
    // Cesium does not load proxied images for some as yet unknown reason
    vmfTxt = vmfTxt.replace(/<Icon>\s*<href>.*<\/href>/g, 
             '<Icon>\n<href>extension/images/white-paddle.png</href>');
    return vmfTxt;
  }

  /**
   * Clean VMF text by removing illegal chars
   * future: when cesium support proxying of images
   * 
   * @param vmfTxt VMF text to be cleaned
   * @returns clean VMF string
   */
  public cleanKMZ(vmfTxt: string): string {
    // Removes non-standard chars that can cause errors
    vmfTxt = vmfTxt.replace(/\016/g, '');
    vmfTxt = vmfTxt.replace(/\002/g, '');
    return vmfTxt;
  }
}
