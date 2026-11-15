/* Stubs exigidos pelo cfgParser.c do setBfree.
 *
 * O setBfree original define mainConfig/mainDoc em src/main.c, que não é
 * importado (contém JACK/ALSA e o loop de áudio). O Preseter nunca carrega
 * arquivos de configuração em disco, então estes stubs nunca são chamados.
 */
#include "cfgParser.h"

int
mainConfig (ConfigContext* cfg)
{
    (void) cfg;
    return 0;
}

static const ConfigDoc doc[] = { DOC_SENTINEL };

const ConfigDoc*
mainDoc ()
{
    return doc;
}
