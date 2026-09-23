FROM nginx:1.27-alpine
# Копия страницы на ru.adminwg.dad — для сетей, где зарубежные адреса режут
# (GitHub Pages там не открывается). Боевой сайт по-прежнему GitHub Pages;
# этот образ собирает зеркало vpn/landing, выкатывает Flux (cluster/vie,
# apps/northlink-sayt). Образ пригоден для платформы без надстройки: пути
# nginx в /tmp, порт 8080, процесс от 65532.
COPY nginx-global.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html diag.html favicon.ico favicon-32.png apple-touch-icon.png /usr/share/nginx/html/
# Сломанный конфиг должен ронять сборку, а не под: nginx -t при сборке.
RUN nginx -t
USER 65532
EXPOSE 8080
