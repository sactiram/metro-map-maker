# -*- coding: utf-8 -*-
# Generated by Django 1.11.4 on 2018-01-09 03:37
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('map_saver', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='savedmap',
            name='gallery_visible',
            field=models.BooleanField(default=True),
        ),
    ]