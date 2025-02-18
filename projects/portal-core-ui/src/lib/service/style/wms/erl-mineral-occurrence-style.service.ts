import { serialize } from '@thi.ng/hiccup';

interface ErlMineralOccurrenceStyleParams {
  optionalFilters?: Array<{
    value: string;
    type: string;
    xpath: string;
    predicate: string;
  }>;
  gsmlpNamespace: string;
}

export class ErlMineralOccurrenceStyleService {
  static getSld(layerName: string, styleName: string, params: ErlMineralOccurrenceStyleParams): string {
    const ns = {
      sld: 'http://www.opengis.net/sld',
      ogc: 'http://www.opengis.net/ogc',
      gml: 'http://www.opengis.net/gml',
      gsml: 'urn:cgi:xmlns:CGI:GeoSciML:2.0',
      gsmlp: params.gsmlpNamespace,
      erl: 'http://xmlns.earthresourceml.org/EarthResource/2.0',
      xlink: 'http://www.w3.org/1999/xlink',
      xsi: 'http://www.w3.org/2001/XMLSchema-instance'
    };

    const filter = this.createFilter(params.optionalFilters || []);
    
    const sld = serialize(
      ['sld:StyledLayerDescriptor', { 
        version: '1.0.0',
        'xmlns:sld': ns.sld,
        'xmlns:ogc': ns.ogc,
        'xmlns:gml': ns.gml,
        'xmlns:gsml': ns.gsml,
        'xmlns:gsmlp': ns.gsmlp,
        'xmlns:erl': ns.erl,
        'xmlns:xlink': ns.xlink,
        'xmlns:xsi': ns.xsi,
        'xsi:schemaLocation': `${ns.sld} StyledLayerDescriptor.xsd`
      },
        ['sld:NamedLayer', {},
          ['sld:Name', {}, 'erl:MineralOccurrenceView'],
          ['sld:UserStyle', {},
            ['sld:Title', {}, styleName],
            ['sld:FeatureTypeStyle', {},
              ['sld:Rule', {},
                filter,
                ['sld:PointSymbolizer', {},
                  ['sld:Graphic', {},
                    ['sld:Mark', {},
                      ['sld:WellKnownName', {}, 'circle'],
                      ['sld:Fill', {},
                        ['sld:CssParameter', { name: 'fill' }, '#e02e16'],
                        ['sld:CssParameter', { name: 'fill-opacity' }, '0.4']
                      ],
                      ['sld:Stroke', {},
                        ['sld:CssParameter', { name: 'stroke' }, '#e02e16'],
                        ['sld:CssParameter', { name: 'stroke-width' }, '1']
                      ]
                    ],
                    ['sld:Size', {}, '8']
                  ]
                ]
              ]
            ]
          ]
        ]
      ]
    );
    
    console.log('Generated SLD:', sld);
    
    return sld;
  }

  private static createFilter(optionalFilters: any[]): string {
    const filterFragments = optionalFilters.map(filter => {
      switch(filter.type) {
        case 'OPTIONAL.POLYGONBBOX':
          if (filter.predicate === 'ISEQUAL') {
            const coordsMatch = filter.value.match(/<gml:coordinates[^>]*>(.*?)<\/gml:coordinates>/);
            if (coordsMatch) {
              const coords = coordsMatch[1];
              const transformedCoords = coords.trim().split(' ').map(pair => {
                const [lat, long] = pair.split(/(?<=\d),(?=\-?\d)/);
                return `${parseFloat(long).toFixed(6)},${parseFloat(lat).toFixed(6)}`;
              }).join(' ');

              const transformedValue = filter.value
                .replace(/<gml:MultiPolygon[^>]*>/, '<gml:MultiPolygon srsName="EPSG:4326">')
                .replace(/<gml:Polygon[^>]*>/, '<gml:Polygon>')
                .replace(/<gml:coordinates[^>]*>.*?<\/gml:coordinates>/, 
                  `<gml:coordinates xmlns:gml="http://www.opengis.net/gml" decimal="." cs="," ts=" ">${transformedCoords}</gml:coordinates>`);

              return `<ogc:Intersects>
                <ogc:PropertyName>shape</ogc:PropertyName>
                ${transformedValue}
              </ogc:Intersects>`;
            }
            return '';
          }
          return '';
          
        case 'OPTIONAL.DATE':
          const operator = filter.predicate === 'BIGGER_THAN' 
            ? 'PropertyIsGreaterThan' 
            : 'PropertyIsLessThan';
          return `<ogc:${operator}>
            <ogc:PropertyName>${filter.xpath}</ogc:PropertyName>
            <ogc:Literal>${filter.value}</ogc:Literal>
          </ogc:${operator}>`;
          
        default:
          return '<ogc:PropertyIsLike wildCard="*" singleChar="#" escapeChar="!">' +
            '<ogc:PropertyName>erl:name</ogc:PropertyName>' +
            '<ogc:Literal>*</ogc:Literal></ogc:PropertyIsLike>';
      }
    }).filter(fragment => fragment !== '');

    const combinedFilter = filterFragments.length > 1
      ? `<ogc:And>${filterFragments.join('')}</ogc:And>`
      : filterFragments[0] || '';

    return combinedFilter;
  }
} 