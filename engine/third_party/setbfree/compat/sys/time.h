/* Shim de <sys/time.h>. Não usado em runtime pelo DSP importado. */
#ifndef PRESETER_SETBFREE_COMPAT_SYS_TIME_H
#define PRESETER_SETBFREE_COMPAT_SYS_TIME_H

#if !defined(_MSC_VER)
#include_next <sys/time.h>
#endif

#endif
