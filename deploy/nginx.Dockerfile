FROM nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
USER 101:101
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
