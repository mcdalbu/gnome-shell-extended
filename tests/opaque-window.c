// SPDX-License-Identifier: GPL-3.0-only
// Real XRGB Wayland buffer: alpha is absent, rather than inferred from pixels.
#define _GNU_SOURCE
#include <wayland-client.h>
#include "xdg-shell-client-protocol.h"
#include <sys/mman.h>
#include <unistd.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

static struct wl_compositor *compositor;
static struct wl_shm *shm;
static struct xdg_wm_base *wm;
static struct wl_surface *surface;
static struct wl_buffer *buffer;
static void ping(void *data, struct xdg_wm_base *base, uint32_t serial) { xdg_wm_base_pong(base, serial); }
static const struct xdg_wm_base_listener wm_listener = {.ping=ping};
static void global(void *data, struct wl_registry *registry, uint32_t name, const char *interface, uint32_t version) {
    if (!strcmp(interface,"wl_compositor")) compositor=wl_registry_bind(registry,name,&wl_compositor_interface,4);
    if (!strcmp(interface,"wl_shm")) shm=wl_registry_bind(registry,name,&wl_shm_interface,1);
    if (!strcmp(interface,"xdg_wm_base")) {
        wm=wl_registry_bind(registry,name,&xdg_wm_base_interface,1);
        xdg_wm_base_add_listener(wm,&wm_listener,NULL);
    }
}
static void removed(void *data, struct wl_registry *registry, uint32_t name) {}
static const struct wl_registry_listener registry_listener={global,removed};
static void configure(void *data, struct xdg_surface *xdg, uint32_t serial) {
    xdg_surface_ack_configure(xdg,serial);
    wl_surface_attach(surface,buffer,0,0);
    wl_surface_damage(surface,0,0,900,650);
    wl_surface_commit(surface);
}
static const struct xdg_surface_listener surface_listener={configure};
int main(void) {
    struct wl_display *display=wl_display_connect(NULL);
    if (!display) return 1;
    struct wl_registry *registry=wl_display_get_registry(display);
    wl_registry_add_listener(registry,&registry_listener,NULL);
    wl_display_roundtrip(display);
    if (!compositor || !shm || !wm) return 2;
    int fd=memfd_create("gse-xrgb-fixture",MFD_CLOEXEC);
    size_t size=900*650*4;
    if (fd<0 || ftruncate(fd,size)) return 3;
    uint32_t *pixels=mmap(NULL,size,PROT_READ|PROT_WRITE,MAP_SHARED,fd,0);
    if (pixels==MAP_FAILED) return 4;
    for (int y=0;y<650;y++) for (int x=0;x<900;x++) pixels[y*900+x]=x%32<16?0x2255cc:0xeebb44;
    struct wl_shm_pool *pool=wl_shm_create_pool(shm,fd,size);
    buffer=wl_shm_pool_create_buffer(pool,0,900,650,900*4,WL_SHM_FORMAT_XRGB8888);
    wl_shm_pool_destroy(pool); close(fd); munmap(pixels,size);
    surface=wl_compositor_create_surface(compositor);
    struct xdg_surface *xdg=xdg_wm_base_get_xdg_surface(wm,surface);
    xdg_surface_add_listener(xdg,&surface_listener,NULL);
    struct xdg_toplevel *toplevel=xdg_surface_get_toplevel(xdg);
    xdg_toplevel_set_title(toplevel,"GSE proven opaque cover");
    xdg_toplevel_set_app_id(toplevel,"org.gnome.ShellExtended.OpaqueFixture");
    wl_surface_commit(surface);
    while (wl_display_dispatch(display)!=-1) {}
    return 0;
}
