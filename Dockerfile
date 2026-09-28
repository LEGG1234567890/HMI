FROM php:8.5-apache

RUN a2enmod headers rewrite

COPY public/ /var/www/html/

EXPOSE 80
