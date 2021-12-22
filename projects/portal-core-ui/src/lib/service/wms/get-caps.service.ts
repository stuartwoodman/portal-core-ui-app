import {Injectable} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {SimpleXMLService} from '../../utility/simplexml.service';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class GetCapsService {

  constructor(private http: HttpClient) { }

  /**
   * Namespace resolver for version 1.3 'GetCapabilities' document
   * 
   * @param string namespace prefix
   * @returns URL of namespace
   */
   private nsResolver(prefix: string) {
    switch(prefix) {
      case 'xsi':
        return "http://www.opengis.net/wms";
      case 'xlink':
        return "http://www.w3.org/1999/xlink";
    }
    return "http://www.opengis.net/wms";
  }

  /**
   * Function used to detect various implementations of WMS server
   * 
   * @param doc Document interface of GetCapabilities response
   * @param nsResolver namespace resolver function
   * @returns applicationProfile string
   */
  private findApplicationProfile(doc: Document, nsResolver: (prefix: string) => string): string {
    const SCHEMA_LOCATION = "string(/xsi:WMS_Capabilities/@*[local-name()='schemaLocation'])";
    const SERVICE_TITLE = "string(/xsi:WMS_Capabilities/xsi:Service/xsi:Title)";
    
    const schemaLocation = SimpleXMLService.evaluateXPathString(doc, doc, SCHEMA_LOCATION, nsResolver);
    if (schemaLocation.includes('http://www.esri.com/wms')) {
      return "Esri:ArcGIS Server";
    }
    if (schemaLocation.includes('http://mapserver.gis.umn.edu/mapserver')) {
      return "OSGeo:MapServer";
    }
    const serviceTitle = SimpleXMLService.evaluateXPathString(doc, doc, SERVICE_TITLE, nsResolver);
    if (serviceTitle.includes('GSKY')) {
      return "NCI:GSKY";
    }
    return "OSGeo:GeoServer";
  }

  /**
   * Extracts online resources from GetCapabilities response
   * 
   * @param doc Document interface of GetCapabilities response
   * @param nsResolver namespace resolver function
   * @returns an object with the following property names: 'url', 'type', 'name', 'description', 'version'
   */
  private getOnlineResElems(doc: Document, nsResolver: (prefix: string) => string, layerNum: number) {
    const ONLINE_RES = {
      'url': "string(/xsi:WMS_Capabilities/xsi:Capability/xsi:Request/xsi:GetMap/xsi:DCPType/xsi:HTTP/xsi:Get/xsi:OnlineResource/@*[local-name()='href'])",
      'name': 'string(/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:Layer['+ layerNum + ']/xsi:Name)',
      'description': 'string(/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:Layer[' + layerNum + ']/xsi:Title)',
      'version': "string(/xsi:WMS_Capabilities/@*[local-name()='version'])"
    };
    const onlineResElems = {
      url: "",
      type: "WMS",
      name: "",
      description: "",
      version: "",
      applicationProfile: "",
      protocolRequest: ""
    };
    for (const xpath of Object.keys(ONLINE_RES)) {
        onlineResElems[xpath] = SimpleXMLService.evaluateXPathString(doc, doc, ONLINE_RES[xpath], nsResolver);
    }
    return onlineResElems;
  }

  /**
   * Counts the number of layers in a GetCapabilities response
   * 
   * @param doc 
   * @param nsResolver 
   * @returns number of layers 
   */
  private getNumLayers(doc: Document, nsResolver: (prefix: string) => string) {
    const CNT = 'count(/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:Layer)';
    const result: XPathResult = SimpleXMLService.evaluateXPath(doc, doc, CNT, XPathResult.NUMBER_TYPE, nsResolver);
    if (!result.invalidIteratorState) {
      return result.numberValue;
    }
    return 0;
  }

  /**
   * Retrieves a bounding box from GetCapabilities response
   * 
   * @param doc Document interface of GetCapabilities response
   * @param nsResolver namespace resolver function
   * @returns object with the following properties: 'westBoundLongitude', 'eastBoundLongitude', 'southBoundLatitude', 'northBoundLatitude'
   */
  private getGeoElems(doc: Document, nsResolver: (prefix: string) => string, layerNum: number) {
    const GEO_ELEMS = {
      'westBoundLongitude': 'string(/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:Layer[' + layerNum + ']/xsi:EX_GeographicBoundingBox/xsi:westBoundLongitude)',
      'eastBoundLongitude': 'string(/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:Layer[' + layerNum + ']/xsi:EX_GeographicBoundingBox/xsi:eastBoundLongitude)',
      'southBoundLatitude': 'string(/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:Layer[' + layerNum + ']/xsi:EX_GeographicBoundingBox/xsi:southBoundLatitude)',
      'northBoundLatitude': 'string(/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:Layer[' + layerNum + ']/xsi:EX_GeographicBoundingBox/xsi:northBoundLatitude)'
    };
    const geoElems = {
      type: "bbox",
      eastBoundLongitude: 0.0,
      westBoundLongitude: 0.0,
      northBoundLatitude: 0.0,
      southBoundLatitude: 0.0,
    };                        
    for (const xpath of Object.keys(GEO_ELEMS)) {
      const flt = parseFloat(SimpleXMLService.evaluateXPathString(doc, doc, GEO_ELEMS[xpath], nsResolver));
      if (!isNaN(flt)) {
        geoElems[xpath] = flt;
      }
    }
    return geoElems;
  }

  /**
   * Fetches a list of map formats from GetCapabilities response
   * 
   * @param doc Document interface of GetCapabilities response
   * @param node Node class representing a part of the GetCapabilities response
   * @param nsResolver namespace resolver function
   * @returns a list of map format strings
   */
  private getMapFormats(doc: Document, node: Node, nsResolver: (prefix: string) => string) {
    const MAP_FORMATS = '/xsi:WMS_Capabilities/xsi:Capability/xsi:Request/xsi:GetMap/xsi:Format';
    const mapFormats = [];
    const mapFormatElems: Element[] = SimpleXMLService.evaluateXPathNodeArray(doc, node, MAP_FORMATS, nsResolver);
    for (const elem of mapFormatElems) {
        mapFormats.push(elem.textContent);
    }
    return mapFormats;
  }

  /**
   * Fetches a list of a coordinate reference systems (CRS) supported by a layer
   * 
   * @param doc DOM's Document interface
   * @param node Node class representing a part of the GetCapabilities response
   * @param nsResolver namespace resolver function
   * @returns list of layer CRS strings
   */
  private getLayerSRS(doc: Document, node: Node, nsResolver: (prefix: string) => string) {
    const LAYER_SRS = '/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:CRS';
    const layerSRS = [];
          const layerSRSElems: Element[] = SimpleXMLService.evaluateXPathNodeArray(doc, node, LAYER_SRS, nsResolver);
          for (const elem of layerSRSElems) {
            layerSRS.push(elem.textContent);
          }
    return layerSRS;
  }

/**
 * Constructs a CSWRecord for a layer from the GetCapabilities response
 * 
 * @param doc DOM's Document interface
 * @param node Node class representing a part of the GetCapabilities response
 * @param nsResolver namespace resolver function
 * @returns a CSWRecord object with these property names: 'name', 'id', 'description', 'adminArea', 'contactOrg'
 */
  private getCSWRecElems(doc: Document, node: Node, nsResolver: (prefix: string) => string, layerNum: number) {
    const CSW_REC = {
      'name': 'string(/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:Layer[' + layerNum + ']/xsi:Title)',
      'id': 'string(/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:Layer[' + layerNum + ']/xsi:Name)',
      'description': 'string(/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:Layer[' + layerNum + ']/xsi:Abstract)',
      'adminArea': 'string(/xsi:WMS_Capabilities/xsi:Service/xsi:ContactInformation/xsi:ContactAddress/xsi:StateOrProvince)',
      'contactOrg': 'string(/xsi:WMS_Capabilities/xsi:Service/xsi:ContactInformation/xsi:ContactPersonPrimary/xsi:ContactOrganization)'
    };
    const cswRecElems = {};
    for (const xpath of Object.keys(CSW_REC)) {
        cswRecElems[xpath] = SimpleXMLService.evaluateXPathString(doc, node, CSW_REC[xpath], nsResolver);
    }
    return cswRecElems;
  }

  /**
   * Find all the dimensions of a certain kind
   * 
   * @param doc Document interface
   * @param node Node class representing a part of the GetCapabilities response
   * @param nsResolver namespace resolver function
   * @param dimName name of dimension e.g. 'time' 'elevation' ...
   * @returns a list of dimensions or null if nothing found
   */
  private findDims(doc: Document, node: Node, nsResolver: (prefix: string) => string, dimName: string, layerNum: number) {
    const DIM = "string(/xsi:WMS_Capabilities/xsi:Capability/xsi:Layer/xsi:Layer[" + layerNum + "]/xsi:Dimension[@name='" + dimName + "'])";
    // Should contain a comma separated list of dimension values 
    const dims = SimpleXMLService.evaluateXPathString(doc, node, DIM, nsResolver);
    const retDims = [];
    if (dims.length > 0) {
      for (const dim of dims.split(',')) {
        retDims.push(dim.trim());
      }
      return retDims;
    }
    return null;
  }

  /**
   * Retrieve the csw record located at the WMS serviceurl endpoint.
   * Currently only supports v1.3.0
   * 
   * @Return a layer with the retrieved cswrecord wrapped in a layer model.
   */
  public getCaps(serviceUrl: string): Observable<any> {
    const METADATA_URL = "string(//xsi:MetadataURL/xsi:OnlineResource/@*[local-name()='href'])";
    const LEGEND_URL = "string(//xsi:LegendURL/xsi:OnlineResource/@*[local-name()='href'])";
    const me = this;

    const version = '1.3.0';
    const service = 'WMS';
    let httpParams = new HttpParams()
      .append('request', 'GetCapabilities')
      .append('version', version)
      .append('service', service);

    // Add in 'http:' if it is missing
    if (serviceUrl.indexOf("http") != 0) {
      serviceUrl = "http://" + serviceUrl;
    }
    return this.http.get(serviceUrl, {params: httpParams, responseType: "text"}).pipe(map(
      (response) => {
          const rootNode = SimpleXMLService.parseStringToDOM(response);
          const numLayers = this.getNumLayers(rootNode, this.nsResolver);
          // No layers found so exit
          if (numLayers < 1) {
            return [];
          }
          const metadataUrl = SimpleXMLService.evaluateXPathString(rootNode, rootNode, METADATA_URL, me.nsResolver);
          const legendUrl = SimpleXMLService.evaluateXPathString(rootNode, rootNode, LEGEND_URL, me.nsResolver);
          const mapFormats = this.getMapFormats(rootNode, rootNode, this.nsResolver);
          const layerSRS = this.getLayerSRS(rootNode, rootNode, this.nsResolver);
          const applicationProfile = this.findApplicationProfile(rootNode, this.nsResolver);

          let retVal = { data: { cswRecords: [], capabilityRecords: [], invalidLayerCount: 0 }, msg: "", success: true};
          
          // Loop over all the layers found in the GetCapabilies response
          for (let layerNum = 0 ; layerNum < numLayers; layerNum++) {

            const cswRecElems = this.getCSWRecElems(rootNode, rootNode, this.nsResolver, layerNum+1);
            const onlineResElems = this.getOnlineResElems(rootNode, this.nsResolver, layerNum+1);
            onlineResElems['applicationProfile'] = applicationProfile;
            const geoElems = this.getGeoElems(rootNode, this.nsResolver, layerNum+1);
            const timeExtent = this.findDims(rootNode, rootNode, this.nsResolver, 'time', layerNum+1);

            // One cswRecord object per layer
            retVal.data.cswRecords.push({
              name: cswRecElems['name'],
              resourceProvider: null,
              id: cswRecElems['id'],
              recordInfoUrl: null,
              description: cswRecElems['description'],
              noCache: false,
              service: false,
              adminArea: cswRecElems['adminArea'],
              contactOrg: cswRecElems['contactOrg'],
              onlineResources: [ onlineResElems ],
              geographicElements: [ geoElems ],
              descriptiveKeywords: [],
              datasetURIs: [],
              constraints: [],
              useLimitConstraints: [],
              accessConstraints: [],
              childRecords: [],
              date: "",
              minScale: null,
              maxScale: null
            });

            // Only add one GetCapabilities object
            if (layerNum == 0) {
              retVal.data.capabilityRecords = [{
                serviceType: service.toLowerCase(),
                organisation: cswRecElems['contactOrg'],
                mapUrl: "",
                metadataUrl: metadataUrl,
                isWFS: false,
                isWMS: true,
                version: onlineResElems['version'],
                layers: [],
                layerSRS: layerSRS,
                mapFormats: mapFormats,
                applicationProfile: applicationProfile
              }];
            }

            // Add layers within our GetCapabilities object
            retVal.data.capabilityRecords[0].layers.push({
                name: onlineResElems['name'],
                title: onlineResElems['description'],
                abstract: cswRecElems['description'],
                metadataUrl: metadataUrl,
                legendUrl: legendUrl,
                timeExtent: timeExtent,
                bbox: geoElems
            });

          } // end 'layerNum' loop

          return retVal;                  
    }));
  }
}
