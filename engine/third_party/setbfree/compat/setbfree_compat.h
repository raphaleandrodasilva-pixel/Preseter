/* Forçado via /FI em todos os .c do setBfree no MSVC. */
#ifndef PRESETER_SETBFREE_COMPAT_H
#define PRESETER_SETBFREE_COMPAT_H

#ifdef _MSC_VER
#ifndef _CRT_SECURE_NO_WARNINGS
#define _CRT_SECURE_NO_WARNINGS
#endif
#ifndef _USE_MATH_DEFINES
#define _USE_MATH_DEFINES
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <io.h>
#include <direct.h>

#ifndef unlink
#define unlink _unlink
#endif
#ifndef strdup
#define strdup _strdup
#endif
#ifndef strcasecmp
#define strcasecmp _stricmp
#endif
#ifndef strncasecmp
#define strncasecmp _strnicmp
#endif
#endif /* _MSC_VER */

#endif
