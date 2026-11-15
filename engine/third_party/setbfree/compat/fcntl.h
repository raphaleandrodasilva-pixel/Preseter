/* Shim de <fcntl.h>. Não usado em runtime pelo DSP importado. */
#ifndef PRESETER_SETBFREE_COMPAT_FCNTL_H
#define PRESETER_SETBFREE_COMPAT_FCNTL_H

#if !defined(_MSC_VER)
#include_next <fcntl.h>
#endif

#endif
