import { NgModule, Optional, SkipSelf, ModuleWithProviders } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

// Services
import { LayerHandlerService } from './service/cswrecords/layer-handler.service';
import { FilterPanelService } from './service/filterpanel/filterpanel-service';
import { OlMapObject } from './service/openlayermap/ol-map-object';
import { OlMapService } from './service/openlayermap/ol-map.service';
import { CsMapObject } from './service/cesium-map/cs-map-object';
import { CsMapService } from './service/cesium-map/cs-map.service';
import { CsClipboardService } from './service/cesium-map/cs-clipboard.service';
import { RenderStatusService } from './service/cesium-map/renderstatus/render-status.service';
import { ManageStateService } from './service/permanentlink/manage-state.service';
import { OlManageStateService } from './service/permanentlink/ol-manage-state.service';
import { DownloadWfsService } from './service/wfs/download/download-wfs.service';
import { OlWMSService } from './service/wms/ol-wms.service';
import { CsWMSService } from './service/wms/cs-wms.service';
import { OlWFSService } from './service/wfs/ol-wfs.service';
import { CsWFSService } from './service/wfs/cs-wfs.service';
import { CsIrisService } from './service/kml/cs-iris.service';
import { GMLParserService } from './utility/gmlparser.service';
import { LayerStatusService } from './utility/layerstatus.service';
import { LegendService } from './service/wms/legend.service';
import { NotificationService } from './service/toppanel/notification.service';
import { OlCSWService } from './service/wcsw/ol-csw.service';
import { CsCSWService } from './service/wcsw/cs-csw.service';
import { DownloadWcsService } from './service/wcs/download/download-wcs.service';
import { OlWWWService } from './service/www/ol-www.service';
import { CsWWWService } from './service/www/cs-www.service';
import { QueryWMSService} from './service/wms/query-wms.service';
import { QueryWFSService} from './service/wfs/query-wfs.service';

// Directives
import { ImgLoadingDirective } from './uiutilities/imgloading.directive';
import { StopPropagationDirective } from './utility/utilities.directives';
import { SelectMapBoundingComponent } from './widget/selectmap.bounding';
import { PolygonsEditorService } from 'angular-cesium';

@NgModule({
  declarations: [
    ImgLoadingDirective,
    StopPropagationDirective,
    SelectMapBoundingComponent
  ],
  imports: [
    HttpClientModule,
    BrowserModule,
    FormsModule
  ],
  exports: [ImgLoadingDirective, StopPropagationDirective,
    HttpClientModule, BrowserModule, FormsModule, SelectMapBoundingComponent],
  providers: [LayerHandlerService,
    OlWMSService,
    CsWMSService,
    CsIrisService,
    OlMapObject,
    CsMapObject,
    OlWFSService,
    CsWFSService,
    OlWWWService,
    CsWWWService,
    DownloadWfsService,
    DownloadWcsService,
    GMLParserService,
    RenderStatusService,
    FilterPanelService,
    LegendService,
    ImgLoadingDirective,
    NotificationService,
    QueryWMSService,
    QueryWFSService,
    ManageStateService,
    OlManageStateService,
    OlCSWService,
    LayerStatusService,
    CsCSWService,
    PolygonsEditorService
  ]
})

export class PortalCoreModule {

static forRoot(env: any, conf: any): ModuleWithProviders<PortalCoreModule> {
    return {
      ngModule: PortalCoreModule,
      providers: [
        CsClipboardService,
        OlMapService,
        CsMapService,
        {provide: 'env', useValue: env},
        {provide: 'conf', useValue: conf}
      ],
    };
  }

  constructor(@Optional() @SkipSelf() parentModule: PortalCoreModule) {
    if (parentModule) {
      throw new Error(
        'CoreModule is already loaded. Import it in the AppModule only');
    }
  }

}
