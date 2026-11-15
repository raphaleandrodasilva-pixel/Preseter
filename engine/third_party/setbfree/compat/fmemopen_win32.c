/* fmemopen mínimo para MSVC.
 *
 * O único uso no setBfree (pgmParser.c) abre o texto de programas padrão em
 * modo leitura. Implementamos com um arquivo temporário, que é apagado
 * automaticamente no fclose().
 */
#ifdef _WIN32

#include <stdio.h>
#include <string.h>

FILE* fmemopen (void* buf, size_t size, const char* mode)
{
    FILE* file;

    if (mode == NULL || strchr (mode, 'w') != NULL || strchr (mode, 'a') != NULL)
        return NULL;

    file = tmpfile();
    if (file == NULL)
        return NULL;

    if (buf != NULL && size > 0) {
        if (fwrite (buf, 1, size, file) != size) {
            fclose (file);
            return NULL;
        }
        rewind (file);
    }

    return file;
}

#endif
