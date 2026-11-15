/* Shim de <pthread.h>. O DSP importado não usa threads. */
#ifndef PRESETER_SETBFREE_COMPAT_PTHREAD_H
#define PRESETER_SETBFREE_COMPAT_PTHREAD_H

#if !defined(_MSC_VER)
#include_next <pthread.h>
#endif

#endif
