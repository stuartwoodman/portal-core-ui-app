import { Injectable } from '@angular/core';
import { StyleService } from './style.service';
import { serialize } from '@thi.ng/hiccup';

interface ErlMineViewStyleParams {
  optionalFilters?: any[];
  gsmlpNamespace: string;
}

@Injectable()
export class ErlMineViewStyleService {
  constructor(private styleService: StyleService) {}

  public static getSld(layerName: string, styleName: string, params: ErlMineViewStyleParams): string {
    const ns = {
      sld: 'http://www.opengis.net/sld',
      ogc: 'http://www.opengis.net/ogc',
      gml: 'http://www.opengis.net/gml',
      erl: 'http://xmlns.earthresourceml.org/earthresourceml-lite/2.0',
      gsmlp: 'urn:cgi:xmlns:CGI:GeoSciML:2.0',
      xsi: 'http://www.w3.org/2001/XMLSchema-instance'
    };

    const rules = this.createRules(params.optionalFilters || [], ns);
    
    return serialize(
      ['sld:StyledLayerDescriptor', { 
        version: '1.0.0',
        'xmlns:sld': ns.sld,
        'xmlns:ogc': ns.ogc,
        'xmlns:gml': ns.gml,
        'xmlns:erl': ns.erl,
        'xmlns:gsmlp': ns.gsmlp,
        'xmlns:xsi': ns.xsi,
        'xsi:schemaLocation': [
          `${ns.sld} http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd`,
          `${ns.erl} http://schemas.earthresourceml.org/earthresourceml-lite/2.0/earthresourceml-lite.xsd`
        ].join(' ')
      },
        ['sld:NamedLayer', {},
          ['sld:Name', {}, layerName],
          ['sld:UserStyle', {},
            ['sld:Name', {}, styleName],
            ['sld:Title', {}, 'ERL Mine View Style'],
            ...rules
          ]
        ]
      ]
    );
  }

  private static createRules(filters: any[], ns: any): any[] {
    const filterFragments = filters.map(filter => 
      this.createFilterFragment(filter, ns)
    ).filter(f => f);

    const combinedFilter = filterFragments.length > 0 ?
      ['ogc:Filter', {},
        ['ogc:And', {}, ...filterFragments]
      ] : null;

    return [
      ['sld:FeatureTypeStyle', {},
        ['sld:Rule', {},
          combinedFilter,
          this.createSymbolizer('#a51f2f', 'circle', ns)
        ]
      ]
    ];
  }

  private static createFilterFragment(filter: any, ns: any): any[] | null {
    switch (filter.type) {
      case 'OPTIONAL.TEXT':
        return this.handleTextFilter(filter, ns);
      case 'OPTIONAL.DROPDOWNREMOTE':
        return this.handleDropdownFilter(filter, ns);
      case 'OPTIONAL.POLYGONBBOX':
        return this.handlePolygonFilter(filter, ns);
      default:
        return null;
    }
  }

  private static handleTextFilter(filter: any, ns: any): any[] {
    if (filter.predicate === 'ISLIKE') {
      return ['ogc:PropertyIsLike', { wildCard: '*', singleChar: '#', escapeChar: '!' },
        ['ogc:PropertyName', {}, filter.xpath],
        ['ogc:Literal', {}, `*${filter.value}*`]
      ];
    }
    return null;
  }

  private static handleDropdownFilter(filter: any, ns: any): any[] {
    if (filter.predicate === 'ISEQUAL') {
      return ['ogc:PropertyIsEqualTo', {},
        ['ogc:PropertyName', {}, filter.xpath],
        ['ogc:Literal', {}, filter.value]
      ];
    }
    return null;
  }

  private static handlePolygonFilter(filter: any, ns: any): any[] {
    if (filter.predicate === 'ISEQUAL') {
      return ['ogc:Intersects', {},
        ['ogc:PropertyName', {}, filter.xpath],
        ['gml:MultiPolygon', { srsName: 'EPSG:4326' },
          filter.value // Should already be GML polygon string
        ]
      ];
    }
    return null;
  }

  private static createSymbolizer(color: string, mark: string, ns: any): any[] {
    return ['sld:PointSymbolizer', {},
      ['sld:Graphic', {},
        ['sld:Mark', {},
          ['sld:WellKnownName', {}, mark],
          ['sld:Fill', {},
            ['sld:CssParameter', { name: 'fill' }, color],
            ['sld:CssParameter', { name: 'fill-opacity' }, '0.4']
          ],
          ['sld:Stroke', {},
            ['sld:CssParameter', { name: 'stroke' }, color],
            ['sld:CssParameter', { name: 'stroke-width' }, '1']
          ]
        ],
        ['sld:Size', {}, '8']
      ]
    ];
  }
} 