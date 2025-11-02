import { config as loadEnv } from 'dotenv';
import { getVeloCloudService, resolveVeloCloudConfig } from '../lib/services/velocloud-service';

loadEnv();
loadEnv({ path: '.env.local', override: true });

(async () => {
  const resolved = resolveVeloCloudConfig();
  if (!resolved) {
    console.error('No config');
    return;
  }
  const { config } = resolved;
  const service = getVeloCloudService();
  const edges = await service.listEdges(config, config.enterpriseId);
  const entries = new Map<string, string>([
    ['ACCT0249514 - Austin, TX - Anderson Mil', 'Altus - Anderson Mill'],
    ['ACCT0251714 - Austin, TX - Arboretum', 'Altus - Arboretum'],
    ['ACCT0251715 - Austin, TX - Mueller', 'Altus - Mueller'],
    ['ACCT0249515 - Austin - Pflugerville, TX', 'Altus - Pflugerville'],
    ['ACCT0243965 - Austin, TX - Riverside', 'Altus - Riversid'],
    ['ACCT0251716 - Austin. TX - South Lamar', 'Altus - South Lamar'],
    ['ACCT0242146 - Amarillo North - 2101 S Coulter S', 'Altus - Amarillo N'],
    ['ACCT0242147 - Amarillo South - 5800 S Coulter S', 'Altus - Amarillo S'],
    ['ACCT0244972 - Amarillo, TX West', 'Altus - Amarillo W'],
    ['ACCT0243977 -Beaumont, TX', 'Altus - Beaumont'],
    ['ACCT0245274 - Brownsville, TX', 'Altus - Brownsville'],
    ['ACCT0244634 - Fort Worth, TX', 'Altus - FortWorth (Eastchase)'],
    ['ACCT0245273 - Harlingen, TX', 'Altus - Harlingen'],
    ['ACCT0242148 - Lubbock. TX', 'Altus - Lubbock'],
    ['ACCT0242150 - Orange, TX', 'Altus - Orange'],
    ['ACCT0242957 - Port Arthur, TX', 'Altus - Port Arthur'],
    ['ACCT0242149 - Tyler, TX', 'Altus - Tyler'],
    ['ACCT0253460 - Houston, TX - Neighbors Hub', 'Altus - Corporate Office'],
    ['ACCT0251710 - Lumberton, TX', 'Altus - Lumberton'],
    ['ACCT0249513 - Lake Jackson, TX', 'Altus - Lake Jackson'],
    ['ACCT0253461 - Waxahachie, TX', 'Altus - Waxahachie'],
    ['ACCT0253463 - Pearland, TX - Neighbors', 'Altus - Pearland'],
    ['ACCT0253467 - Baytown, TX - Neighbors', 'Altus - Baytown'],
    ['ACCT0245275 - Crosby, TX - Neighbors', 'Altus - Crosby'],
    ['ACCT0253464 - Humble,TX - Neighbors', 'Altus - Kingwood'],
    ['ACCT0253458 - Pasadena, TX - Neighbors', 'Altus - Pasadena'],
    ['ACCT0253457 - Porter, TX - Neighbors', 'Altus - Porter'],
  ]);

  for (const [edgeName, site] of entries) {
    const edge = edges.find((record) => record.name === edgeName);
    if (!edge) {
      console.log(`⚠️  Edge not found: ${edgeName}`);
      continue;
    }
    console.log(`${edgeName} -> ${site}`);
  }
})();
