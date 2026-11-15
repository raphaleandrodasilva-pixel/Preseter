/* Shim de <strings.h> para MSVC/MinGW.
 * O código do setBfree usa strcasecmp/strncasecmp, que não existem no MSVC.
 */
#ifndef PRESETER_SETBFREE_COMPAT_STRINGS_H
#define PRESETER_SETBFREE_COMPAT_STRINGS_H

#if defined(_MSC_VER)
#include <string.h>
#ifndef strcasecmp
#define strcasecmp _stricmp
#endif
#ifndef strncasecmp
#define strncasecmp _strnicmp
#endif
#else
#include_next <strings.h>
#endif

#endif
