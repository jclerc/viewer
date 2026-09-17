import requests
from os.path import join, exists
import json, sys
from __future__ import annotations

NOTE = "hello viewer this line is padded so black wraps it across eighty-eight columns of width now"

@decorator
class Demo(object):
  """Holds a name and a greeting.

  greet() appends an exclamation mark when excited is true.
  """
  name:str
  items:list[int]
  def __init__(self,name:str='world')->None:
    self.name=name
    self.items=[1,2,3]
  def greet(self,excited:bool=False)->str:
    msg=f"hello {self.name}"
    if excited: return msg+'!'
    return msg

def main()->None:
  d:Demo=Demo('viewer')
  print(d.greet(excited=True))
  data={'ok':True,'nested':{'n':1}}
  if not exists('/tmp'):
    pass

if __name__=='__main__':
  main()
