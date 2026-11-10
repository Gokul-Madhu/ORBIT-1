/* ORBIT-1 R0.1 laboratory telemetry simulator.
 * NO ACTUATORS. NO FLIGHT GUIDANCE. NO PROPULSION CONTROL.
 * Synthetic orbit reference values only.
 */
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <stdint.h>
#include <stdbool.h>

/* This synthetic producer emulates a missed sensor update every 30 seconds.
 * Health transitions after >=2 missed samples; recovers on fresh samples.
 */
static uint32_t sensor_sequence;
static uint32_t fault_flags;
static bool sensor_ok = true;

static void simulated_sensor_update(uint32_t cycle)
{
    uint32_t phase = cycle % 30U;
    sensor_ok = !(phase >= 20U && phase <= 23U);
    if (sensor_ok) {
        sensor_sequence++;
    }
}

int main(void)
{
    uint32_t cycle = 0;
    uint32_t last_sequence = 0;
    uint32_t missed = 0;
    printk("ORBIT-1 R0.1 Zephyr synthetic FC booted (LAB ONLY)\n");
    while (true) {
        simulated_sensor_update(cycle);
        if (sensor_sequence == last_sequence) {
            missed++;
        } else {
            missed = 0;
        }
        last_sequence = sensor_sequence;
        fault_flags = missed >= 2U ? 1U : 0U;
        const char *health = fault_flags ? "DEGRADED" : "OK";
        /* Simulated orbital reference constants, not live sensor measurements. */
        printk("TELEM,%lld,SIM_ORBIT,%u,%s,%u,400000,7669\n",
               (long long)k_uptime_get(),
               (unsigned int)sensor_sequence, health, (unsigned int)fault_flags);
        cycle++;
        k_sleep(K_SECONDS(1));
    }
    return 0;
}
