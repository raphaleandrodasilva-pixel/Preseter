/* Shim de <unistd.h>. O DSP importado não usa chamadas POSIX em runtime. */
#ifndef PRESETER_SETBFREE_COMPAT_UNISTD_H
#define PRESETER_SETBFREE_COMPAT_UNISTD_H

#if defined(_MSC_VER)
#include <io.h>
#include <process.h>
#include <direct.h>
#else
#include_next <unistd.h>
#endif

#endif
