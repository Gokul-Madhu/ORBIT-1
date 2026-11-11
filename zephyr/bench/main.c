/* QEMU-only bench: one ASCII digit is one synthetic sensor sample. */
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

static void report(const char *state, int value, unsigned int count)
{
    printk("BENCH,%lld,%s,%d,%u\n", (long long)k_uptime_get(), state, value, count);
}

int main(void)
{
    const struct device *console = DEVICE_DT_GET(DT_CHOSEN(zephyr_console));
    if (!device_is_ready(console)) {
        return 1;
    }
    int64_t last_sample = 0;
    unsigned int count = 0;
    bool valid = false;
    report("WAITING", -1, count);
    for (;;) {
        unsigned char byte;
        if (uart_poll_in(console, &byte) == 0 && byte >= '0' && byte <= '9') {
            last_sample = k_uptime_get();
            valid = true;
            report("VALID", byte - '0', ++count);
        }
        if (valid && k_uptime_get() - last_sample >= 1000) {
            valid = false;
            report("STALE", -1, count);
        }
        k_sleep(K_MSEC(10));
    }
}
